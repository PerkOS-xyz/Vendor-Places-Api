import { config } from "dotenv";
import type { PaymentConfig } from "../types/index.js";

config();

// Validate required environment variables
const requiredEnvVars = {
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
  PAYMENT_WALLET_ADDRESS: process.env.PAYMENT_WALLET_ADDRESS,
  FACILITATOR_URL: process.env.FACILITATOR_URL || "https://x402.org/facilitator",
  NETWORK: process.env.NETWORK || "base",
  PAYMENT_PRICE_USD: process.env.PAYMENT_PRICE_USD || "0.01",
};

// Determine if we're in production environment
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

// Check for missing required variables
const missing = Object.entries(requiredEnvVars)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

// Validate network
const validNetworks = ["base", "base-sepolia", "avalanche", "solana"];
if (!validNetworks.includes(requiredEnvVars.NETWORK!)) {
  console.error(`❌ Invalid network: ${requiredEnvVars.NETWORK}. Valid: ${validNetworks.join(", ")}`);
  process.exit(1);
}

// Export configuration
export const x402Config: PaymentConfig = {
  payTo: requiredEnvVars.PAYMENT_WALLET_ADDRESS! as `0x${string}`,
  facilitatorUrl: requiredEnvVars.FACILITATOR_URL!,
  network: requiredEnvVars.NETWORK! as "base" | "base-sepolia" | "avalanche" | "solana",
  priceUsd: requiredEnvVars.PAYMENT_PRICE_USD!
};

export const googlePlacesApiKey = requiredEnvVars.GOOGLE_PLACES_API_KEY!;
export const serverPort = parseInt(process.env.PORT || "3000", 10);

// X402 Payment Routes Configuration with Enhanced Bazaar Discovery
export const paymentRoutes = {
  "POST /api/places/text-search": {
    price: `$${x402Config.priceUsd}`,
    network: x402Config.network,
    discoverable: isProduction, // Enable Bazaar discovery in production only
    description: "Search for places, businesses, and points of interest using Google Places API with real-time data and comprehensive location information",
    tags: ["places", "search", "google", "business", "location", "maps", "poi", "restaurants", "local-search"],
    inputSchema: {
      type: "object",
      description: "Request parameters for Google Places text search",
      properties: {
        query: {
          type: "string",
          description: "Search term for places (e.g., 'pizza restaurants', 'gas stations near me', 'coffee shops in downtown')",
          minLength: 1,
          maxLength: 512,
          examples: ["coffee shops", "restaurants in downtown", "ATM near me", "pizza delivery", "gas stations", "hospitals nearby"]
        },
        location: {
          type: "string",
          description: "Geographic bias point as 'latitude,longitude' (e.g., '37.7749,-122.4194' for San Francisco)",
          pattern: "^-?\\d+\\.\\d+,-?\\d+\\.\\d+$",
          examples: ["37.7749,-122.4194", "40.7128,-74.0060", "51.5074,-0.1278"]
        },
        radius: {
          type: "number",
          description: "Search radius in meters from location point (default: 50000, max: 50000)",
          minimum: 1,
          maximum: 50000,
          default: 50000,
          examples: [1000, 5000, 10000, 25000]
        },
        language: {
          type: "string",
          description: "Language code for results (optional, default: 'en')",
          pattern: "^[a-z]{2}$",
          default: "en",
          examples: ["en", "es", "fr", "de", "ja", "pt"]
        },
        region: {
          type: "string",
          description: "Region code for biasing results (optional, e.g., 'us', 'gb')",
          pattern: "^[a-z]{2}$",
          examples: ["us", "gb", "ca", "au", "de", "fr", "jp"]
        }
      },
      required: ["query"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      description: "Google Places search results with comprehensive place information and metadata",
      properties: {
        results: {
          type: "array",
          description: "Array of place objects matching the search criteria",
          items: {
            type: "object",
            description: "Individual place/business information",
            properties: {
              place_id: {
                type: "string",
                description: "Unique Google Places identifier for this place",
                pattern: "^[A-Za-z0-9_-]+$"
              },
              name: {
                type: "string",
                description: "Business or place name"
              },
              formatted_address: {
                type: "string",
                description: "Complete human-readable address"
              },
              geometry: {
                type: "object",
                description: "Geographic location information",
                properties: {
                  location: {
                    type: "object",
                    description: "Precise coordinates",
                    properties: {
                      lat: {
                        type: "number",
                        description: "Latitude coordinate",
                        minimum: -90,
                        maximum: 90
                      },
                      lng: {
                        type: "number",
                        description: "Longitude coordinate",
                        minimum: -180,
                        maximum: 180
                      }
                    },
                    required: ["lat", "lng"]
                  },
                  viewport: {
                    type: "object",
                    description: "Recommended viewport for displaying this place",
                    properties: {
                      northeast: {
                        type: "object",
                        properties: {
                          lat: { type: "number" },
                          lng: { type: "number" }
                        }
                      },
                      southwest: {
                        type: "object",
                        properties: {
                          lat: { type: "number" },
                          lng: { type: "number" }
                        }
                      }
                    }
                  }
                },
                required: ["location"]
              },
              rating: {
                type: "number",
                description: "Average user rating (1.0-5.0 stars)",
                minimum: 1.0,
                maximum: 5.0
              },
              user_ratings_total: {
                type: "number",
                description: "Total number of user ratings",
                minimum: 0
              },
              price_level: {
                type: "number",
                description: "Price level indicator (0=Free, 1=Inexpensive, 2=Moderate, 3=Expensive, 4=Very Expensive)",
                minimum: 0,
                maximum: 4
              },
              types: {
                type: "array",
                description: "Array of place type categories",
                items: {
                  type: "string",
                  description: "Google Places type category (e.g., 'restaurant', 'gas_station', 'hospital')"
                }
              },
              business_status: {
                type: "string",
                description: "Current operational status",
                enum: ["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"]
              },
              opening_hours: {
                type: "object",
                description: "Business hours information",
                properties: {
                  open_now: {
                    type: "boolean",
                    description: "Whether the place is currently open"
                  },
                  weekday_text: {
                    type: "array",
                    description: "Human-readable opening hours for each day",
                    items: { type: "string" }
                  }
                }
              },
              photos: {
                type: "array",
                description: "Place photos metadata",
                items: {
                  type: "object",
                  properties: {
                    photo_reference: {
                      type: "string",
                      description: "Reference ID for fetching the photo via Google Places API"
                    },
                    height: {
                      type: "number",
                      description: "Photo height in pixels"
                    },
                    width: {
                      type: "number",
                      description: "Photo width in pixels"
                    }
                  }
                }
              },
              plus_code: {
                type: "object",
                description: "Plus Code location identifier",
                properties: {
                  global_code: {
                    type: "string",
                    description: "Global Plus Code (e.g., '849VCWC8+R9')"
                  },
                  compound_code: {
                    type: "string",
                    description: "Compound Plus Code with locality"
                  }
                }
              }
            }
          }
        },
        status: {
          type: "string",
          description: "Google Places API response status",
          enum: ["OK", "ZERO_RESULTS", "OVER_QUERY_LIMIT", "REQUEST_DENIED", "INVALID_REQUEST", "UNKNOWN_ERROR"]
        },
        next_page_token: {
          type: "string",
          description: "Token for fetching additional results (if available)"
        },
        statistics: {
          type: "object",
          description: "Search query statistics and performance metrics",
          properties: {
            results_count: {
              type: "number",
              description: "Number of places returned in this response"
            },
            total_results: {
              type: "number",
              description: "Estimated total results available"
            },
            search_radius_km: {
              type: "number",
              description: "Effective search radius in kilometers"
            },
            query_time_ms: {
              type: "number",
              description: "Google Places API response time in milliseconds"
            },
            has_more_results: {
              type: "boolean",
              description: "Whether additional results are available via pagination"
            }
          }
        },
        metadata: {
          type: "object",
          description: "X402 payment and processing metadata",
          properties: {
            cost: {
              type: "string",
              description: "Cost of this API request",
              pattern: "^\\$\\d+\\.\\d{2}$"
            },
            protocol: {
              type: "string",
              description: "Payment protocol version used",
              const: "x402 v1.0"
            },
            network: {
              type: "string",
              description: "Blockchain network used for payment",
              enum: ["base", "base-sepolia", "avalanche", "ethereum", "polygon"]
            },
            payment_method: {
              type: "string",
              description: "Payment settlement method",
              const: "gasless_micropayment"
            },
            request_id: {
              type: "string",
              description: "Unique identifier for this API request"
            },
            timestamp: {
              type: "string",
              description: "ISO 8601 timestamp of request processing",
              format: "date-time"
            },
            processing_time_ms: {
              type: "number",
              description: "Total request processing time in milliseconds"
            }
          },
          required: ["cost", "protocol", "network", "payment_method"]
        }
      },
      required: ["results", "status", "metadata"]
    },
    examples: [
      {
        input: {
          query: "coffee shops",
          location: "37.7749,-122.4194",
          radius: 2000,
          language: "en"
        },
        description: "Find coffee shops within 2km of San Francisco downtown with English results"
      },
      {
        input: {
          query: "restaurants",
          language: "es",
          region: "es"
        },
        description: "Find restaurants globally with Spanish language results and Spain regional bias"
      },
      {
        input: {
          query: "gas stations near me",
          radius: 5000
        },
        description: "Find gas stations within 5km (location bias should be provided by client application)"
      },
      {
        input: {
          query: "hospitals",
          location: "40.7128,-74.0060",
          radius: 10000,
          language: "en",
          region: "us"
        },
        description: "Find hospitals within 10km of New York City with US regional preferences"
      }
    ],
    performance: {
      typical_response_time_ms: 150,
      rate_limit: "1000 requests/hour per wallet",
      cache_duration_seconds: 300,
      max_results_per_request: 20,
      supported_languages: ["en", "es", "fr", "de", "it", "pt", "ja", "zh", "ko", "ru"],
      supported_regions: ["us", "gb", "ca", "au", "de", "fr", "es", "it", "jp", "br", "mx", "in"]
    }
  }
};

// Enhanced Service Discovery Configuration with Bazaar Standards
export const serviceDiscovery = {
  service: "Places",
  version: "2.0.0",
  description: "Google Places API Wrapper with X402 gasless micropayments for comprehensive location search and business discovery",
  payment: {
    protocol: "x402 v1.0",
    price: `$${x402Config.priceUsd}`,
    network: x402Config.network,
    gasless: true,
    facilitator: x402Config.facilitatorUrl
  },
  capabilities: {
    search_types: ["businesses", "points_of_interest", "restaurants", "hotels", "gas_stations", "hospitals", "pharmacies"],
    data_sources: ["google_places_api"],
    real_time: true,
    geographic_coverage: "global",
    languages_supported: ["en", "es", "fr", "de", "it", "pt", "ja", "zh", "ko", "ru"],
    regions_supported: ["us", "gb", "ca", "au", "de", "fr", "es", "it", "jp", "br", "mx", "in"]
  },
  performance: {
    typical_response_time_ms: 150,
    rate_limit: "1000 requests/hour per wallet",
    cache_duration_seconds: 300,
    max_results_per_request: 20,
    uptime_percentage: 99.9
  },
  endpoints: {
    "/api/places/text-search": {
      method: "POST",
      description: "Search for places, businesses, and points of interest using Google Places API",
      payment_required: true,
      inputSchema: paymentRoutes["POST /api/places/text-search"].inputSchema,
      outputSchema: paymentRoutes["POST /api/places/text-search"].outputSchema,
      examples: paymentRoutes["POST /api/places/text-search"].examples,
      tags: paymentRoutes["POST /api/places/text-search"].tags
    }
  },
  metadata: {
    created: "2024-01-15T00:00:00Z",
    updated: new Date().toISOString(),
    author: "x402hub.xyz",
    license: "MIT",
    contact: {
      website: "https://places-api.x402hub.xyz",
      documentation: "https://places-api.x402hub.xyz/api/info",
      support: "https://github.com/x402hub/places-api"
    },
    compliance: {
      x402_version: "1.0",
      bazaar_compatible: true,
      ai_agent_optimized: true
    }
  }
};

