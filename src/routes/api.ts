import { Router, type Request, type Response } from "express";
import { PlacesService } from "../services/places.js";
import { serviceDiscovery } from "../config/x402.js";
import type { PlaceSearchRequest, APIError } from "../types/index.js";

const router = Router();
const placesService = PlacesService.getInstance();

/**
 * Service information endpoint (free)
 * Provides API documentation and payment details for AI agents
 */
router.get("/info", (req: Request, res: Response) => {
  res.json({
    ...serviceDiscovery,
    usage: {
      example_request: {
        method: "POST",
        endpoint: "/api/places/text-search",
        headers: {
          "Content-Type": "application/json"
        },
        body: {
          query: "pizza restaurants",
          location: "37.7749,-122.4194",
          radius: 2000
        }
      },
      curl_example: `curl -X POST ${req.protocol}://${req.get("host")}/api/places/text-search \\
  -H "Content-Type: application/json" \\
  -d '{"query": "coffee shops", "location": "40.7128,-74.0060", "radius": 1000}'`
    }
  });
});

/**
 * Service discovery endpoint (free)
 * X402 protocol discovery for AI agents
 */
router.get("/.well-known/x402", (req: Request, res: Response) => {
  res.json({
    version: "1.0",
    service: serviceDiscovery.service,
    description: serviceDiscovery.description,
    payment: serviceDiscovery.payment,
    endpoints: Object.entries(serviceDiscovery.endpoints).map(([path, config]) => ({
      path: path.split(" ")[1], // Remove HTTP method
      method: config.method,
      description: config.description,
      payment_required: true,
      price: serviceDiscovery.payment.price,
      inputSchema: config.inputSchema,
      outputSchema: config.outputSchema
    })),
    contact: {
      support: "support@places-api.com",
      documentation: `${req.protocol}://${req.get("host")}/api/info`
    }
  });
});

/**
 * Google Places Text Search endpoint (paid)
 * Protected by x402 payment middleware
 * Price: $0.01 USDC per request
 */
router.post("/places/text-search", async (req: Request, res: Response) => {
  try {
    console.log(`📍 Places search request from ${req.ip}`);

    // Validate request body
    const validationErrors = placesService.validateRequest(req.body);
    if (validationErrors.length > 0) {
      console.log(`❌ Validation failed:`, validationErrors);
      const error: APIError = {
        error: "Invalid Request",
        message: "Request validation failed",
        code: 400,
        details: {
          errors: validationErrors,
          example: {
            query: "pizza restaurants",
            location: "37.7749,-122.4194", // optional
            radius: 2000 // optional
          }
        }
      };
      return res.status(400).json(error);
    }

    // Extract and validate request parameters
    const searchRequest: PlaceSearchRequest = {
      query: req.body.query.trim(),
      location: req.body.location?.trim(),
      radius: req.body.radius
    };

    // Perform places search
    const searchResults = await placesService.textSearch(searchRequest);

    // Log successful request
    console.log(`✅ Places search completed: ${searchResults.results.length} results`);

    // Return results
    res.json(searchResults);

  } catch (error) {
    console.error("❌ Places search error:", error);

    let apiError: APIError;
    let statusCode = 500;

    if (error instanceof Error) {
      // Handle validation errors
      if (error.message.includes("required") ||
          error.message.includes("format") ||
          error.message.includes("must be")) {
        statusCode = 400;
        apiError = {
          error: "Validation Error",
          message: error.message,
          code: 400
        };
      }
      // Handle Google API errors
      else if (error.message.includes("unavailable") || error.message.includes("API")) {
        statusCode = 503;
        apiError = {
          error: "Service Unavailable",
          message: "Google Places API is temporarily unavailable",
          code: 503,
          details: {
            retry_after: "30 seconds",
            support: "Contact support if issue persists"
          }
        };
      }
      // Handle generic errors
      else {
        apiError = {
          error: "Internal Server Error",
          message: "An unexpected error occurred while processing your request",
          code: 500,
          details: {
            retry: true,
            support: "Contact support if issue persists"
          }
        };
      }
    } else {
      // Fallback for unknown error types
      apiError = {
        error: "Internal Server Error",
        message: "An unexpected error occurred",
        code: 500
      };
    }

    res.status(statusCode).json(apiError);
  }
});

/**
 * Health check endpoint (free)
 * Used for monitoring and service status
 */
router.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "Places API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;