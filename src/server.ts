import { config } from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { paymentMiddleware, type Resource } from "x402-express";
import { facilitator } from "@coinbase/x402";
import { PlacesService } from "../lib/custom/places-service.js";
import { getConfig } from "../lib/custom/config/api-config.js";
import { x402Config as x402ConfigFromFile, serviceDiscovery } from "./config/x402.js";
import registerRouter from "./routes/register.js";

// Load environment variables
config();

const app = express();
const port = process.env.PORT || 3001;

// Trust proxy for correct protocol detection in production (Vercel)
app.set('trust proxy', true);

/**
 * X402-Compliant Express Server for Google Places API
 *
 * This server uses the official x402-express middleware to handle:
 * - EIP-712 payment authorizations (gasless for clients)
 * - Facilitator integration for transferWithAuthorization
 * - True micropayment protocol compliance
 */

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Payment', 'X-Payment-Response'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// X402 Debug Logging Middleware - Traces the full payment flow
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);

  // Only log payment-related requests
  if (req.path.includes('/api/places/') || req.path.includes('/api/register')) {
    console.log('\n' + '='.repeat(70));
    console.log(`🔵 [${timestamp}] REQUEST ${requestId}`);
    console.log('='.repeat(70));
    console.log(`📍 ${req.method} ${req.path}`);
    console.log(`🌐 Client IP: ${req.ip || req.socket.remoteAddress}`);

    // Log X402 payment headers
    const paymentHeader = req.headers['x-payment'];
    const paymentResponseHeader = req.headers['x-payment-response'];

    if (paymentHeader) {
      console.log('💳 X-PAYMENT header detected:');
      console.log(`   Length: ${String(paymentHeader).length} chars`);
      console.log(`   Preview: ${String(paymentHeader).substring(0, 100)}...`);
    } else {
      console.log('⚠️  No X-PAYMENT header - expecting 402 response');
    }

    if (paymentResponseHeader) {
      console.log('📩 X-PAYMENT-RESPONSE header:', paymentResponseHeader);
    }

    // Log request body for POST
    if (req.method === 'POST' && req.body) {
      console.log('📦 Request Body:', JSON.stringify(req.body, null, 2).substring(0, 500));
    }

    // Capture response
    const originalSend = res.send;
    const originalJson = res.json;

    res.send = function(body) {
      console.log('\n' + '-'.repeat(70));
      console.log(`🔴 [${new Date().toISOString()}] RESPONSE ${requestId}`);
      console.log('-'.repeat(70));
      console.log(`📊 Status: ${res.statusCode}`);

      if (res.statusCode === 402) {
        console.log('💰 Payment Required - X402 middleware returned 402');
        try {
          const parsed = typeof body === 'string' ? JSON.parse(body) : body;
          console.log('   Network:', parsed.network);
          console.log('   Pay To:', parsed.payTo);
          console.log('   Max Amount:', parsed.maxAmountRequired);
        } catch {}
      }

      console.log('='.repeat(70) + '\n');
      return originalSend.call(this, body);
    };

    res.json = function(body) {
      console.log('\n' + '-'.repeat(70));
      console.log(`🔴 [${new Date().toISOString()}] RESPONSE ${requestId}`);
      console.log('-'.repeat(70));
      console.log(`📊 Status: ${res.statusCode}`);

      if (res.statusCode === 402) {
        console.log('💰 Payment Required - X402 middleware returned 402');
        console.log('   Network:', body.network);
        console.log('   Pay To:', body.payTo);
        console.log('   Max Amount:', body.maxAmountRequired);
        console.log('   Facilitator:', body.facilitator || 'URL-based');
      } else if (res.statusCode === 200 && body.metadata) {
        console.log('✅ Payment Verified - Request processed successfully');
        console.log('   Cost:', body.metadata.cost);
        console.log('   Protocol:', body.metadata.protocol);
        console.log('   Network:', body.metadata.network);
      }

      console.log('='.repeat(70) + '\n');
      return originalJson.call(this, body);
    };
  }

  next();
});

// Get configuration
const x402Config = getConfig();
if (!x402Config) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Check for mainnet CDP API credentials when using base network
if (x402Config.network === "base" && (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET)) {
  console.error('❌ Missing CDP API credentials required for mainnet (base network)');
  console.error('   Please set CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables');
  process.exit(1);
}

console.log('🔧 X402 Configuration:');
console.log(`   Network: ${x402Config.network}`);
console.log(`   Pay To: ${x402Config.payTo}`);
console.log(`   Price: ${x402Config.priceUsd} USD`);
console.log(`   Facilitator: ${x402Config.network === "base" ? "CDP Official (mainnet)" : x402Config.facilitatorUrl}`);

// Initialize Places service
const placesService = PlacesService.getInstance();

// X402 Payment Middleware - Use proper facilitator for network
// For Avalanche mainnet: use Stack facilitator (stack.perkos.xyz)
// For Base mainnet: use CDP facilitator
// For testnets: use URL-based facilitator
const getNetworkForMiddleware = () => {
  // x402 library supports: base-sepolia, base, avalanche-fuji, avalanche, iotex, solana-devnet, solana, sei, sei-testnet, polygon, polygon-amoy
  // Return the network as-is since x402 supports Avalanche natively
  return x402Config.network as "base" | "base-sepolia" | "avalanche" | "avalanche-fuji";
};

const getFacilitator = () => {
  // Base mainnet uses CDP facilitator
  if (x402Config.network === "base") {
    return facilitator; // Official CDP facilitator for Base mainnet
  }
  // All other networks (Avalanche, base-sepolia, etc.) use URL-based Stack facilitator
  return { url: x402Config.facilitatorUrl as Resource };
};

app.use(
  paymentMiddleware(
    x402Config.payTo, // Server wallet address
    {
      // Define protected endpoints with pricing
      "POST /api/places/text-search": {
        price: `$${x402Config.priceUsd}`, // e.g., "$0.01"
        network: getNetworkForMiddleware(),
      },
    },
    getFacilitator()
  )
);

// Health check endpoint (free)
app.get('/health', (req, res) => {
  res.json({
    status: "healthy",
    service: "Places API",
    version: "2.0.0-x402-compliant",
    deployment: "Express + X402 Middleware",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    payment: {
      protocol: "x402 v1.0",
      network: x402Config.network,
      facilitator: x402Config.network === "base" ? "CDP Official (mainnet)" : x402Config.facilitatorUrl,
      gasless: true
    },
    features: {
      "eip712_signatures": true,
      "gasless_micropayments": true,
      "transfer_with_authorization": true,
      "facilitator_settlement": true,
      "anti_reuse_protection": true
    }
  });
});

// Override x402-express discovery with enhanced Bazaar Discovery
app.get('/.well-known/x402', (req, res) => {
  const { version: serviceVersion, ...serviceDiscoveryRest } = serviceDiscovery;
  res.json({
    version: "1.0", // X402 protocol version
    ...serviceDiscoveryRest,
    service_version: serviceVersion, // Service version separate from X402 protocol version
    // X402 v1.0 compliance fields
    x402_compliance: "✅ Fully Compliant",
    features: {
      gasless_payments: "Client pays no gas fees",
      eip712_signatures: "Uses EIP-712 typed data signatures",
      facilitator_settlement: "Facilitator handles transferWithAuthorization",
      instant_settlement: "Sub-second payment processing"
    }
  });
});

// API info endpoint (free)
app.get('/api/info', (req, res) => {
  res.json({
    service: "Places",
    version: "2.0.0-x402-compliant",
    description: "Places API with X402 gasless micropayments",
    payment: {
      protocol: "x402 v1.0",
      price: `$${x402Config.priceUsd}`,
      network: x402Config.network,
      gasless: true,
      description: "Places API with X402 gasless micropayments"
    },
    endpoints: {
      "/api/places/text-search": {
        method: "POST",
        description: "Search for places using text query",
        payment_required: true,
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
    },
    deployment: {
      platform: "Express.js with X402 Middleware",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development"
    },
    usage: {
      example_request: {
        method: "POST",
        endpoint: "/api/places/text-search",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": "base64-encoded-eip712-payment-authorization"
        },
        body: {
          query: "coffee shops",
          location: "37.7749,-122.4194",
          radius: 1000
        }
      },
      payment_flow: {
        step1: "Client creates EIP-712 payment authorization (gasless)",
        step2: "Client sends authorization in X-PAYMENT header",
        step3: "Server verifies signature via facilitator",
        step4: "Facilitator executes transferWithAuthorization",
        step5: "USDC moves from client to server (facilitator pays gas)",
        step6: "Server returns Google Places data"
      }
    },
    x402_compliance: "✅ Fully Compliant with transferWithAuthorization"
  });
});

// Protected Google Places endpoint - X402 middleware handles payment!
app.post('/api/places/text-search', async (req, res) => {
  try {
    console.log('📍 Processing X402-verified Places search request');

    // Validate request
    const validationErrors = placesService.validateRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid Request",
        message: "Request validation failed",
        details: {
          errors: validationErrors,
          example: {
            query: "pizza restaurants",
            location: "37.7749,-122.4194", // optional
            radius: 2000 // optional
          }
        }
      });
    }

    // Perform places search (payment already verified by x402 middleware)
    const searchResults = await placesService.textSearch({
      query: req.body.query.trim(),
      location: req.body.location?.trim(),
      radius: req.body.radius
    });

    console.log(`✅ X402 Places search completed: ${searchResults.results.length} results`);

    // Return results with payment metadata
    res.json({
      ...searchResults,
      metadata: {
        cost: `$${x402Config.priceUsd}`,
        protocol: "x402 v1.0",
        payment_method: "gasless_micropayment",
        facilitator_used: true,
        network: x402Config.network,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Places search error:', error);

    // Check if response has already been sent by middleware
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal Server Error",
        message: "Places search failed",
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  }
});

// Registration endpoint (for Stack marketplace)
app.use('/api/register', registerRouter);

// Root endpoint redirects to info
app.get('/', (req, res) => {
  res.redirect('/api/info');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Endpoint ${req.method} ${req.path} not found`,
    available_endpoints: [
      "GET /health",
      "GET /.well-known/x402",
      "GET /api/info",
      "POST /api/places/text-search"
    ]
  });
});

// Error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Server error:', error);
  res.status(500).json({
    error: "Internal Server Error",
    message: "Something went wrong",
    details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
  });
});

// Start server (only in non-Vercel environments)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log('🚀 X402-Compliant Places API Server Started');
    console.log(`📍 Server running at: http://localhost:${port}`);
    console.log(`🔧 Network: ${x402Config.network}`);
    console.log(`💰 Price: $${x402Config.priceUsd} per request`);
    console.log(`🏦 Facilitator: ${x402Config.network === "base" ? "CDP Official (mainnet)" : x402Config.facilitatorUrl}`);
    console.log(`✅ X402 Compliance: Enabled with transferWithAuthorization`);
    console.log('');
    console.log('Available endpoints:');
    console.log(`  GET  http://localhost:${port}/health`);
    console.log(`  GET  http://localhost:${port}/.well-known/x402`);
    console.log(`  GET  http://localhost:${port}/api/info`);
    console.log(`  POST http://localhost:${port}/api/places/text-search (requires X402 payment)`);
    console.log('');
    console.log('Stack Registration:');
    console.log(`  POST http://localhost:${port}/api/register        - Register with Stack`);
    console.log(`  GET  http://localhost:${port}/api/register/status - Check registration status`);
  });
}

// Export for Vercel serverless
export default app;