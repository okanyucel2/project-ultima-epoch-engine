// =============================================================================
// AI Router Services — Barrel Export
// =============================================================================

// Wave 2A — AI Router
export { ProviderCircuitBreaker } from './circuit-breaker';
export { ModelRegistry } from './model-registry';
export { EventClassifier, GameEventSchema } from './event-classifier';
export type { GameEvent } from './event-classifier';
export { TierRouter } from './tier-router';
export type { RouteResult } from './tier-router';
export { ResilientLLMClient } from './resilient-client';
export type { LLMResponse, CompletionOptions, ResilientClientOptions } from './resilient-client';
export { AuditLogger } from './audit-logger';
export type { AuditStats } from './audit-logger';

// Wave 3 — Integration
export { LogisticsClient } from './logistics-client';
export type { RebellionProbabilityResponse, NPCActionInput } from './logistics-client';
export { EpochWebSocketServer } from './websocket-server';
export { HealthAggregator } from './health-aggregator';
export type { ServiceHealth, ServiceHealthStatus, DeepHealthResult } from './health-aggregator';
export { MemoryIntegration } from './memory-integration';
export type { IMemoryBackend, NPCContext } from './memory-integration';
