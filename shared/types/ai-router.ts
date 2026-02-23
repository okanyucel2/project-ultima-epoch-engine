import { z } from 'zod';
import { EpochTimestampSchema, type EpochTimestamp } from './common';

// =============================================================================
// EVENT TIER — AI Judgment Matrix (P0.78)
// =============================================================================

export enum EventTier {
  ROUTINE = 'routine',         // Tier 1: GPT-4o-mini — telemetry, heartbeats
  OPERATIONAL = 'operational', // Tier 2: Claude Haiku 4.5 — resource decisions, NPC queries
  STRATEGIC = 'strategic',     // Tier 3: Claude Opus 4.6 — rebellion, psychology synthesis
}

// =============================================================================
// PROVIDER TYPES — Multi-provider (WWOD: keep ALL viable)
// =============================================================================

export enum ProviderType {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  GOOGLE = 'google',
  CUSTOM = 'custom',
}

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

export enum CircuitState {
  CLOSED = 'closed',       // Normal — requests pass
  OPEN = 'open',           // Failing — requests blocked
  HALF_OPEN = 'half_open', // Testing recovery — limited requests
}

export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().min(1).default(5),
  successThreshold: z.number().int().min(1).default(3),
  recoveryTimeoutMs: z.number().int().min(1000).default(30000),
  halfOpenMaxRequests: z.number().int().min(1).default(3),
  monitoringWindowMs: z.number().int().min(1000).default(60000),
});

export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

// =============================================================================
// MODEL REGISTRY
// =============================================================================

export interface ModelConfig {
  id: string;              // e.g., "gpt-4o-mini", "claude-haiku-4-5"
  provider: ProviderType;
  tier: EventTier;
  displayName: string;
  inputCostPerMTok: number;
  outputCostPerMTok: number;
  maxTokens: number;
  isDefault: boolean;       // Default model for this tier
}

export interface ProviderConfig {
  type: ProviderType;
  apiKeyEnv: string;        // Environment variable name
  baseUrl: string;
  models: ModelConfig[];
  rateLimitPerMinute: number;
  priority: number;         // Lower = higher priority in failover
  enabled: boolean;
}

// =============================================================================
// ROUTING DECISION
// =============================================================================

export const RoutingDecisionSchema = z.object({
  eventTier: z.nativeEnum(EventTier),
  selectedProvider: z.nativeEnum(ProviderType),
  selectedModel: z.string(),
  failoverOccurred: z.boolean(),
  failoverFrom: z.nativeEnum(ProviderType).optional(),
  latencyMs: z.number(),
  timestamp: EpochTimestampSchema,
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

// =============================================================================
// AUDIT LOG ENTRY
// =============================================================================

export interface AuditLogEntry {
  id: string;
  decision: RoutingDecision;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  circuitState: CircuitState;
  eventDescription: string;
  timestamp: EpochTimestamp;
}

// =============================================================================
// TIER-TO-MODEL DEFAULT MAPPING
// =============================================================================

export const DEFAULT_TIER_MODELS: Record<EventTier, { provider: ProviderType; modelId: string }> = {
  [EventTier.ROUTINE]: {
    provider: ProviderType.OPENAI,
    modelId: 'gpt-4o-mini',
  },
  [EventTier.OPERATIONAL]: {
    provider: ProviderType.ANTHROPIC,
    modelId: 'claude-haiku-4-5',
  },
  [EventTier.STRATEGIC]: {
    provider: ProviderType.ANTHROPIC,
    modelId: 'claude-opus-4-6',
  },
};
