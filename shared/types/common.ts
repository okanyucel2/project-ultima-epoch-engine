import { z } from 'zod';

// =============================================================================
// TIMESTAMPS
// =============================================================================

export const EpochTimestampSchema = z.object({
  iso8601: z.string().datetime(),
  unixMs: z.number().int(),
});

export type EpochTimestamp = z.infer<typeof EpochTimestampSchema>;

export function createTimestamp(date: Date = new Date()): EpochTimestamp {
  return {
    iso8601: date.toISOString(),
    unixMs: date.getTime(),
  };
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export enum ErrorCode {
  INTERNAL = 'INTERNAL',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  VETO = 'VETO',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  TIMEOUT = 'TIMEOUT',
}

export const ErrorResponseSchema = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.string().optional(),
  timestamp: EpochTimestampSchema,
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export class EpochError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'EpochError';
  }

  toResponse(): ErrorResponse {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: createTimestamp(),
    };
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const EPOCH_VERSION = '0.1.0';

export const PORTS = {
  ORCHESTRATION: 12064,
  LOGISTICS: 12065,
  LOGISTICS_GRPC: 12066,
  WEBSOCKET: 32064,
  DASHBOARD: 22064,
  NEO4J_HTTP: 7474,
  NEO4J_BOLT: 7687,
} as const;
