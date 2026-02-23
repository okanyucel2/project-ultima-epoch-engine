// =============================================================================
// EPOCH MEMORY — Barrel Export
//
// NPC persistent memory graph with time-decaying trauma, wisdom scoring,
// confidence edges, and rebellion probability calculation.
// =============================================================================

// Main facade
export { EpochMemoryService } from './epoch-memory-service';

// Graph layer
export { Neo4jConnectionPool } from './graph/connection-pool';
export type { PoolOptions } from './graph/connection-pool';
export { NPCMemoryGraph } from './graph/npc-memory';
export { ConfidenceManager } from './graph/confidence-edge';

// Trauma & decay
export { TraumaScorer } from './trauma/trauma-scorer';
export {
  hyperbolicDecay,
  exponentialDecay,
  linearDecay,
  applyDecay,
} from './trauma/decay-functions';

// Wisdom
export { WisdomScorer } from './wisdom/wisdom-scorer';
export {
  QUERY_MEMORY_COUNT,
  QUERY_EVENT_DIVERSITY,
  QUERY_TEMPORAL_SPAN,
  QUERY_POSITIVE_RATIO,
  QUERY_ALL_MEMORIES,
} from './wisdom/wisdom-queries';
