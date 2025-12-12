/**
 * Vercel Serverless Configuration
 * Standalone config for API functions without process.exit()
 */

export interface PaymentConfig {
  payTo: `0x${string}`;
  facilitatorUrl: string;
  network: "base" | "base-sepolia" | "solana";
  priceUsd: string;
}

// Get configuration with fallbacks (no process.exit in serverless)
export function getConfig(): PaymentConfig | null {
  const config = {
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
    PAYMENT_WALLET_ADDRESS: process.env.PAYMENT_WALLET_ADDRESS,
    FACILITATOR_URL: process.env.FACILITATOR_URL,
    NETWORK: process.env.NETWORK || "base",
    PAYMENT_PRICE_USD: process.env.PAYMENT_PRICE_USD || "0.01"
  };

  // Check for missing required variables
  const missing = Object.entries(config)
    .filter(([key, value]) => !value && key !== 'NETWORK' && key !== 'PAYMENT_PRICE_USD')
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
    return null;
  }

  return {
    payTo: config.PAYMENT_WALLET_ADDRESS! as `0x${string}`,
    facilitatorUrl: config.FACILITATOR_URL!,
    network: config.NETWORK! as "base" | "base-sepolia" | "solana",
    priceUsd: config.PAYMENT_PRICE_USD!
  };
}

export const googlePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;

// X402 Payment Routes Configuration
export function getPaymentRoutes(config: PaymentConfig) {
  return {
    "POST /api/places/text-search": {
      price: `$${config.priceUsd}`,
      network: config.network,
    }
  };
}

// Service discovery configuration
export function getServiceDiscovery(config: PaymentConfig) {
  return {
    service: "Places",
    version: "1.0.0",
    description: "Places API Wrapper with x402 micropayments",
    payment: {
      protocol: "x402",
      price: `$${config.priceUsd}`,
      network: config.network,
    },
    endpoints: {
      "/api/places/text-search": {
        method: "POST",
        description: "Search for places using text query",
        schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search term (required)" },
            location: { type: "string", description: "Lat,lng bias (optional)" },
            radius: { type: "number", description: "Search radius in meters (optional)" }
          },
          required: ["query"]
        }
      }
    }
  };
}