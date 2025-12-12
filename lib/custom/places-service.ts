/**
 * Google Places Service for Vercel Serverless Functions
 * Standalone implementation without Express dependencies
 */

export interface PlaceSearchRequest {
  query: string;
  location?: string;
  radius?: number;
}

export interface Place {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
  price_level?: number;
  types: string[];
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  photos?: {
    photo_reference: string;
    height: number;
    width: number;
  }[];
}

export interface PlaceSearchResponse {
  status: string;
  results: Place[];
  metadata: {
    query: string;
    cost: string;
    timestamp: string;
  };
}

export class PlacesService {
  private static instance: PlacesService;

  public static getInstance(): PlacesService {
    if (!PlacesService.instance) {
      PlacesService.instance = new PlacesService();
    }
    return PlacesService.instance;
  }

  /**
   * Search for places using text query
   */
  async textSearch(request: PlaceSearchRequest): Promise<PlaceSearchResponse> {
    try {
      const googlePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;

      if (!googlePlacesApiKey) {
        throw new Error("Google Places API key not configured");
      }

      // Validate required parameters
      if (!request.query || request.query.trim().length === 0) {
        throw new Error("Query parameter is required and cannot be empty");
      }

      // Parse location if provided
      let location: { lat: number; lng: number } | undefined;
      if (request.location) {
        const [lat, lng] = request.location.split(",").map(coord => parseFloat(coord.trim()));
        if (isNaN(lat) || isNaN(lng)) {
          throw new Error("Location must be in 'lat,lng' format (e.g., '37.7749,-122.4194')");
        }
        location = { lat, lng };
      }

      // Validate radius
      if (request.radius !== undefined && (request.radius < 0 || request.radius > 50000)) {
        throw new Error("Radius must be between 0 and 50000 meters");
      }

      console.log(`🔍 Searching places: "${request.query}"${location ? ` near ${request.location}` : ""}${request.radius ? ` within ${request.radius}m` : ""}`);

      // Build Google Places API URL
      const baseUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
      const params = new URLSearchParams({
        key: googlePlacesApiKey,
        query: request.query
      });

      if (location) {
        params.append('location', `${location.lat},${location.lng}`);
      }
      if (request.radius) {
        params.append('radius', request.radius.toString());
      }

      const url = `${baseUrl}?${params.toString()}`;

      console.log(`🌐 Making direct request to Google Places API...`);

      // Make direct HTTP request to Google Places API
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'X402-Places-Service/1.0.0'
        }
      });

      if (!response.ok) {
        console.error("❌ HTTP request failed:", response.status, response.statusText);
        throw new Error(`Places API HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Handle API errors
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("❌ Places API error:", data.status, data.error_message);
        throw new Error(`Places API error: ${data.status}${data.error_message ? ` - ${data.error_message}` : ""}`);
      }

      // Format results for agents
      const places: Place[] = (data.results || []).map((result: any) => ({
        place_id: result.place_id!,
        name: result.name!,
        formatted_address: result.formatted_address!,
        rating: result.rating,
        price_level: result.price_level,
        types: result.types || [],
        geometry: {
          location: {
            lat: result.geometry!.location.lat,
            lng: result.geometry!.location.lng
          }
        },
        // Limit photos to reduce response size
        ...(result.photos && {
          photos: result.photos.slice(0, 2).map((photo: any) => ({
            photo_reference: photo.photo_reference,
            height: photo.height,
            width: photo.width
          }))
        })
      }));

      console.log(`✅ Found ${places.length} places`);

      return {
        status: data.status,
        results: places,
        metadata: {
          query: request.query,
          cost: "$0.01",
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error("❌ Places search error:", error);

      // Handle different error types
      if (error instanceof Error) {
        // Re-throw validation errors as-is
        if (error.message.includes("required") || error.message.includes("format") || error.message.includes("must be")) {
          throw error;
        }

        // Handle Google API specific errors
        if (error.message.includes("API")) {
          throw new Error(`Places API unavailable: ${error.message}`);
        }
      }

      // Generic error fallback
      throw new Error("Places search failed. Please try again later.");
    }
  }

  /**
   * Validate search request parameters
   */
  validateRequest(request: any): string[] {
    const errors: string[] = [];

    if (!request || typeof request !== "object") {
      errors.push("Request body must be a JSON object");
      return errors;
    }

    if (!request.query) {
      errors.push("Missing required field: 'query'");
    } else if (typeof request.query !== "string") {
      errors.push("Field 'query' must be a string");
    } else if (request.query.trim().length === 0) {
      errors.push("Field 'query' cannot be empty");
    } else if (request.query.length > 2048) {
      errors.push("Field 'query' must be less than 2048 characters");
    }

    if (request.location !== undefined) {
      if (typeof request.location !== "string") {
        errors.push("Field 'location' must be a string in 'lat,lng' format");
      } else {
        const parts = request.location.split(",");
        if (parts.length !== 2) {
          errors.push("Field 'location' must be in 'lat,lng' format (e.g., '37.7749,-122.4194')");
        } else {
          const [lat, lng] = parts.map((p: string) => parseFloat(p.trim()));
          if (isNaN(lat) || isNaN(lng)) {
            errors.push("Field 'location' must contain valid latitude and longitude numbers");
          } else if (lat < -90 || lat > 90) {
            errors.push("Latitude must be between -90 and 90");
          } else if (lng < -180 || lng > 180) {
            errors.push("Longitude must be between -180 and 180");
          }
        }
      }
    }

    if (request.radius !== undefined) {
      if (typeof request.radius !== "number") {
        errors.push("Field 'radius' must be a number");
      } else if (request.radius < 0) {
        errors.push("Field 'radius' must be non-negative");
      } else if (request.radius > 50000) {
        errors.push("Field 'radius' must be 50000 meters or less");
      }
    }

    return errors;
  }
}