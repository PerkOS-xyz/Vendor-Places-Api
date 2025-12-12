import type { SolanaAddress } from "x402-express";

// Google Places API Types
export interface PlaceSearchRequest {
  query: string;
  location?: string; // lat,lng format
  radius?: number;   // radius in meters
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
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
}

// X402 Configuration Types
export interface PaymentConfig {
  payTo: `0x${string}` | SolanaAddress;
  facilitatorUrl: string;
  network: "base" | "base-sepolia" | "avalanche" | "solana";
  priceUsd: string;
}

export interface ServiceInfo {
  service: string;
  version: string;
  description: string;
  payment: {
    protocol: string;
    price: string;
    network: string;
  };
  endpoints: Record<string, {
    method: string;
    description: string;
    schema?: any;
  }>;
}

// Error Types
export interface APIError {
  error: string;
  message: string;
  code?: number;
  details?: any;
}