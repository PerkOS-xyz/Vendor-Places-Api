import { Router, Request, Response } from "express";
import { x402Config, paymentRoutes, serviceDiscovery } from "../config/x402.js";

const router = Router();

/**
 * POST /api/register
 * Trigger registration with Stack marketplace
 * Uses SERVER_URL for vendor API domain and FACILITATOR_URL for Stack server
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    // Get Stack/Facilitator URL and this server's URL from environment
    const facilitatorUrl = process.env.FACILITATOR_URL || "http://localhost:3005";
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;

    if (!serverUrl || serverUrl.includes("localhost")) {
      console.warn("⚠️  SERVER_URL not set, using localhost");
    }

    console.log(`🔗 Registering with Stack at ${facilitatorUrl}`);
    console.log(`   Server URL: ${serverUrl}`);

    // Build endpoint definitions from x402 config
    const endpoints = Object.entries(paymentRoutes).map(([route, config]) => {
      const [method, path] = route.split(" ");
      return {
        path,
        method: method as "GET" | "POST" | "PUT" | "DELETE",
        description: config.description,
        priceUsd: config.price.replace("$", ""),
        inputSchema: config.inputSchema,
        outputSchema: config.outputSchema,
      };
    });

    // Build registration payload
    const registrationPayload = {
      url: serverUrl,
      name: serviceDiscovery.service,
      description: serviceDiscovery.description,
      category: "api" as const,
      tags: ["places", "search", "google", "location", "maps", "x402"],
      // Direct registration fields
      walletAddress: x402Config.payTo,
      network: x402Config.network,
      priceUsd: x402Config.priceUsd,
      facilitatorUrl: facilitatorUrl,
      endpoints,
    };

    console.log("📦 Registration payload:", JSON.stringify(registrationPayload, null, 2));

    // Send registration to Stack
    const response = await fetch(`${facilitatorUrl}/api/vendors/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(registrationPayload),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error("❌ Registration failed:", result.error);
      return res.status(400).json({
        success: false,
        error: result.error || "Registration failed",
      });
    }

    console.log("✅ Successfully registered with Stack!");
    console.log(`   Vendor ID: ${result.vendor?.id}`);
    console.log(`   Mode: ${result.mode}`);

    return res.json({
      success: true,
      vendor: result.vendor,
      mode: result.mode,
      facilitatorUrl,
      serverUrl,
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Registration failed",
    });
  }
});

/**
 * GET /api/register/status
 * Check current registration status
 */
router.get("/status", async (req: Request, res: Response) => {
  try {
    const facilitatorUrl = process.env.FACILITATOR_URL || "http://localhost:3005";
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;

    // Check if we're registered
    const response = await fetch(`${facilitatorUrl}/api/vendors`);

    if (!response.ok) {
      return res.json({
        registered: false,
        error: "Could not reach Stack server",
        facilitatorUrl,
        serverUrl,
      });
    }

    const data = await response.json();
    const vendors = data.vendors || [];

    // Find our vendor by URL
    const ourVendor = vendors.find(
      (v: { url: string }) =>
        v.url === serverUrl ||
        v.url.replace(/\/$/, "") === serverUrl.replace(/\/$/, "")
    );

    return res.json({
      registered: !!ourVendor,
      vendor: ourVendor || null,
      facilitatorUrl,
      serverUrl,
    });
  } catch (error) {
    return res.status(500).json({
      registered: false,
      error: error instanceof Error ? error.message : "Status check failed",
    });
  }
});

export default router;
