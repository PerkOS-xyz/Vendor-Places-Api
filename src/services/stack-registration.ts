import { x402Config, serviceDiscovery } from "../config/x402.js";

/**
 * Stack Auto-Registration Service
 *
 * Automatically registers this vendor API with the PerkOS Stack marketplace
 * on server startup. This enables discovery by AI agents and other clients.
 */

interface RegistrationConfig {
  stackUrl: string;
  selfUrl: string;
  name?: string;
  description?: string;
  category?: "api" | "nft" | "defi" | "gaming" | "dao" | "ai" | "data" | "other";
  retryAttempts?: number;
  retryDelayMs?: number;
}

interface RegistrationResult {
  success: boolean;
  vendorId?: string;
  error?: string;
  alreadyRegistered?: boolean;
}

export class StackRegistrationService {
  private config: Required<RegistrationConfig>;
  private registered = false;

  constructor(config: RegistrationConfig) {
    this.config = {
      stackUrl: config.stackUrl,
      selfUrl: config.selfUrl,
      name: config.name || serviceDiscovery.service,
      description: config.description || serviceDiscovery.description,
      category: config.category || "api",
      retryAttempts: config.retryAttempts ?? 3,
      retryDelayMs: config.retryDelayMs ?? 5000,
    };
  }

  /**
   * Register this vendor with the Stack marketplace
   */
  async register(): Promise<RegistrationResult> {
    if (this.registered) {
      console.log("📋 Already registered with Stack");
      return { success: true, alreadyRegistered: true };
    }

    console.log(`🔗 Attempting to register with Stack at ${this.config.stackUrl}`);

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const result = await this.attemptRegistration();

        if (result.success) {
          this.registered = true;
          console.log(`✅ Successfully registered with Stack!`);
          console.log(`   Vendor ID: ${result.vendorId}`);
          console.log(`   Name: ${this.config.name}`);
          console.log(`   URL: ${this.config.selfUrl}`);
          return result;
        }

        // Check if already registered (not an error)
        if (result.error?.includes("already registered")) {
          this.registered = true;
          console.log(`📋 Vendor already registered with Stack`);
          return { success: true, alreadyRegistered: true };
        }

        console.warn(`⚠️  Registration attempt ${attempt} failed: ${result.error}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️  Registration attempt ${attempt} error: ${errorMessage}`);
      }

      // Wait before retry (unless it's the last attempt)
      if (attempt < this.config.retryAttempts) {
        console.log(`   Retrying in ${this.config.retryDelayMs / 1000}s...`);
        await this.delay(this.config.retryDelayMs);
      }
    }

    console.error(`❌ Failed to register with Stack after ${this.config.retryAttempts} attempts`);
    return {
      success: false,
      error: `Registration failed after ${this.config.retryAttempts} attempts`,
    };
  }

  /**
   * Attempt a single registration request
   */
  private async attemptRegistration(): Promise<RegistrationResult> {
    const registerUrl = `${this.config.stackUrl}/api/vendors/register`;

    const response = await fetch(registerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: this.config.selfUrl,
        name: this.config.name,
        description: this.config.description,
        category: this.config.category,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      vendorId: data.vendor?.id,
    };
  }

  /**
   * Check if Stack is available
   */
  async checkStackHealth(): Promise<boolean> {
    try {
      const healthUrl = `${this.config.stackUrl}/health`;
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Verify registration status with Stack
   */
  async verifyRegistration(): Promise<{ registered: boolean; vendorId?: string }> {
    try {
      const vendorsUrl = `${this.config.stackUrl}/api/vendors`;
      const response = await fetch(vendorsUrl);

      if (!response.ok) {
        return { registered: false };
      }

      const data = await response.json();
      const vendors = data.vendors || [];

      // Find our vendor by URL
      const ourVendor = vendors.find(
        (v: { url: string }) =>
          v.url === this.config.selfUrl ||
          v.url.replace(/\/$/, "") === this.config.selfUrl.replace(/\/$/, "")
      );

      if (ourVendor) {
        this.registered = true;
        return { registered: true, vendorId: ourVendor.id };
      }

      return { registered: false };
    } catch {
      return { registered: false };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Initialize and run auto-registration
 * Call this after server starts
 */
export async function initStackRegistration(): Promise<void> {
  // Get Stack URL from environment or use default
  const stackUrl = process.env.STACK_URL || process.env.PERKOS_STACK_URL || "http://localhost:3005";

  // Get self URL - important for Stack to discover us
  const selfUrl = process.env.SELF_URL || process.env.VENDOR_URL || `http://localhost:${process.env.PORT || 3000}`;

  // Skip registration if disabled
  if (process.env.DISABLE_STACK_REGISTRATION === "true") {
    console.log("📋 Stack auto-registration disabled via environment variable");
    return;
  }

  const registrationService = new StackRegistrationService({
    stackUrl,
    selfUrl,
    name: serviceDiscovery.service,
    description: serviceDiscovery.description,
    category: "api",
    retryAttempts: 3,
    retryDelayMs: 5000,
  });

  // Check if Stack is available first
  console.log(`🔍 Checking Stack availability at ${stackUrl}...`);
  const stackAvailable = await registrationService.checkStackHealth();

  if (!stackAvailable) {
    console.warn(`⚠️  Stack not available at ${stackUrl}`);
    console.warn("   Auto-registration skipped. Register manually later or ensure Stack is running.");
    return;
  }

  console.log(`✅ Stack is available`);

  // Check if already registered
  const verification = await registrationService.verifyRegistration();
  if (verification.registered) {
    console.log(`📋 Already registered with Stack (ID: ${verification.vendorId})`);
    return;
  }

  // Attempt registration
  await registrationService.register();
}

// Export singleton for manual usage
export const stackRegistration = new StackRegistrationService({
  stackUrl: process.env.STACK_URL || process.env.PERKOS_STACK_URL || "http://localhost:3005",
  selfUrl: process.env.SELF_URL || process.env.VENDOR_URL || `http://localhost:${process.env.PORT || 3000}`,
});
