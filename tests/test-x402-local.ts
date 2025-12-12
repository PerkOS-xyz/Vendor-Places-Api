/**
 * X402 Payment Flow Test
 *
 * Tests the complete x402 payment flow:
 * 1. Request protected endpoint without payment (expect 402)
 * 2. Get payment requirements
 * 3. Create transferWithAuthorization signature
 * 4. Retry request with X-Payment header
 * 5. Verify successful response
 */

import { config } from 'dotenv';
config(); // Load .env file

import { createWalletClient, http, parseUnits } from 'viem';
import { avalanche, avalancheFuji } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Test wallet (DO NOT USE IN PRODUCTION - for testing only)
// Load from environment variable
const TEST_PRIVATE_KEY = process.env.TEST_WALLET_PRIVATE_KEY;
if (!TEST_PRIVATE_KEY) {
  console.error('❌ TEST_WALLET_PRIVATE_KEY environment variable is required');
  process.exit(1);
}

// API Configuration
const API_BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const PROTECTED_ENDPOINT = '/api/places/text-search';

// USDC addresses by network
const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  'avalanche': '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  'avalanche-fuji': '0x5425890298aed601595a70AB815c96711a31Bc65',
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

// Chain configs
const CHAIN_CONFIGS: Record<string, { chain: typeof avalanche; chainId: number }> = {
  'avalanche': { chain: avalanche, chainId: 43114 },
  'avalanche-fuji': { chain: avalancheFuji, chainId: 43113 },
};

async function testX402PaymentFlow() {
  console.log('🧪 Starting X402 Payment Flow Test\n');
  console.log(`📍 API Base URL: ${API_BASE_URL}`);

  try {
    // Step 1: Request protected endpoint without payment
    console.log('\n📍 Step 1: Request protected endpoint without payment');
    const initialResponse = await fetch(`${API_BASE_URL}${PROTECTED_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'coffee shops',
        location: '37.7749,-122.4194',
      }),
    });

    if (initialResponse.status !== 402) {
      const body = await initialResponse.text();
      console.log(`Response body: ${body.substring(0, 500)}`);
      throw new Error(`Expected 402, got ${initialResponse.status}`);
    }

    const paymentRequirements = await initialResponse.json();
    console.log('✅ Received 402 Payment Required');
    console.log('💰 Payment requirements:', JSON.stringify(paymentRequirements, null, 2));

    // Step 2: Extract payment details from accepts array (x402 v1 format)
    console.log('\n📍 Step 2: Extract payment details');

    // x402 returns accepts array with payment options
    const acceptedPayment = paymentRequirements.accepts?.[0];
    if (!acceptedPayment) {
      throw new Error('No accepted payment methods in 402 response');
    }

    const { maxAmountRequired, network, payTo, asset, extra } = acceptedPayment;

    // Parse price from maxAmountRequired (in base units)
    const priceUsd = maxAmountRequired ?
      (Number(maxAmountRequired) / 1e6).toFixed(6) : '0.01';
    const amountInUSDC = BigInt(maxAmountRequired || parseUnits('0.01', 6));

    console.log(`💵 Price: $${priceUsd} (${amountInUSDC} USDC units)`);
    console.log(`🌐 Network: ${network}`);
    console.log(`💳 Pay to: ${payTo}`);

    // Step 3: Create wallet client
    console.log('\n📍 Step 3: Create wallet client');
    const account = privateKeyToAccount(TEST_PRIVATE_KEY as `0x${string}`);

    const chainConfig = CHAIN_CONFIGS[network];
    if (!chainConfig) {
      throw new Error(`Unknown network: ${network}. Supported: ${Object.keys(CHAIN_CONFIGS).join(', ')}`);
    }

    const walletClient = createWalletClient({
      account,
      chain: chainConfig.chain,
      transport: http()
    });

    console.log(`👤 Wallet address: ${account.address}`);

    // Step 4: Generate nonce and validity window
    console.log('\n📍 Step 4: Generate payment parameters');
    const nonce = `0x${Buffer.from(Date.now().toString()).toString('hex').padStart(64, '0')}` as `0x${string}`;
    const validAfter = Math.floor(Date.now() / 1000) - 60; // Valid from 1 minute ago
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour

    console.log(`🔐 Nonce: ${nonce.substring(0, 20)}...`);
    console.log(`⏰ Valid from: ${new Date(validAfter * 1000).toISOString()}`);
    console.log(`⏰ Valid until: ${new Date(validBefore * 1000).toISOString()}`);

    // Step 5: Create EIP-712 signature for transferWithAuthorization
    console.log('\n📍 Step 5: Sign transferWithAuthorization');

    // Use asset address from 402 response, or fallback to known addresses
    const usdcAddress = (asset as `0x${string}`) || USDC_ADDRESSES[network];
    if (!usdcAddress) {
      throw new Error(`Unknown network for USDC: ${network}`);
    }

    console.log(`💎 USDC Contract: ${usdcAddress}`);

    // EIP-712 Domain (EIP-3009 standard) - use extra info from 402 response
    const domain = {
      name: extra?.name || 'USD Coin',
      version: extra?.version || '2',
      chainId: chainConfig.chainId,
      verifyingContract: usdcAddress
    };

    // EIP-712 Types for TransferWithAuthorization
    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    };

    // Message to sign
    const message = {
      from: account.address,
      to: payTo as `0x${string}`,
      value: amountInUSDC,
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce
    };

    // Sign the message
    const signature = await walletClient.signTypedData({
      account,
      domain,
      types,
      primaryType: 'TransferWithAuthorization',
      message
    });

    console.log(`✍️  Signature: ${signature.substring(0, 20)}...`);

    // Step 6: Create X-Payment header (x402 PaymentPayload format)
    console.log('\n📍 Step 6: Create X-Payment header');

    // x402 standard payload format
    const paymentPayload = {
      x402Version: 1,
      scheme: 'exact',
      network,
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: payTo,
          value: amountInUSDC.toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce
        }
      }
    };

    const xPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
    console.log(`📦 X-Payment header created (${xPaymentHeader.length} chars, base64 encoded)`);

    // Step 7: Retry request with payment
    console.log('\n📍 Step 7: Retry request with X-Payment header');
    const paidResponse = await fetch(`${API_BASE_URL}${PROTECTED_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': xPaymentHeader
      },
      body: JSON.stringify({
        query: 'coffee shops',
        location: '37.7749,-122.4194',
      }),
    });

    console.log(`📡 Response status: ${paidResponse.status}`);

    if (paidResponse.status === 200) {
      const data = await paidResponse.json();
      console.log('✅ Payment successful! Resource delivered:');
      console.log(`   Results: ${data.results?.length || 0} places found`);
      console.log(`   Cost: ${data.metadata?.cost}`);
      console.log(`   Protocol: ${data.metadata?.protocol}`);
      console.log(`   Network: ${data.metadata?.network}`);
    } else {
      const error = await paidResponse.text();
      console.log('❌ Payment failed:');
      console.log(error);
    }

    console.log('\n🎉 X402 Payment Flow Test Complete!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testX402PaymentFlow()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
