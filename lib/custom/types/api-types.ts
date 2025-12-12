/**
 * API Types for Vercel Serverless Functions
 */

export interface APIError {
  error: string;
  message: string;
  code?: number;
  details?: any;
}