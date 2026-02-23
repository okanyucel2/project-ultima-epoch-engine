import { z } from 'zod';
import { EpochTimestampSchema, type EpochTimestamp } from './common';

// =============================================================================
// NPC MEMORY NODE — Stored in Neo4j (Epoch Memory)
// =============================================================================

export const MemoryNodeSchema = z.object({
  memoryId: z.string(),
  npcId: z.string(),
  event: z.string(),
  playerAction: z.string(),
  wisdomScore: z.number().min(0).max(1),
  traumaScore: z.number().min(0).max(1),
  rawTraumaScore: z.number().min(0).max(1),  // Before time decay
  timestamp: EpochTimestampSchema,
});

export type MemoryNode = z.infer<typeof MemoryNodeSchema>;

// =============================================================================
// CONFIDENCE EDGE — Neo4j relationship property on [:TRUSTS]
// (NPC)-[:TRUSTS {confidence, lastUpdated, decayRate}]->(Director/Entity)
// =============================================================================

export const ConfidenceEdgeSchema = z.object({
  npcId: z.string(),
  entityId: z.string(),           // Director (player) or another NPC
  confidence: z.number().min(0).max(1),
  decayRate: z.number().min(0).default(0.1),  // Alpha for hyperbolic decay
  lastUpdated: EpochTimestampSchema,
});

export type ConfidenceEdge = z.infer<typeof ConfidenceEdgeSchema>;

// =============================================================================
// TIME DECAY — Hyperbolic by default
// score * (1 / (1 + α * t))
// =============================================================================

export enum DecayStrategy {
  HYPERBOLIC = 'hyperbolic',    // Default — old trauma persists weakly
  EXPONENTIAL = 'exponential',  // Aggressive — fast forgetting
  LINEAR = 'linear',            // Simple — constant rate
}

export const DecayConfigSchema = z.object({
  strategy: z.nativeEnum(DecayStrategy).default(DecayStrategy.HYPERBOLIC),
  alpha: z.number().min(0).default(0.1),     // Hyperbolic: decay rate
  lambda: z.number().min(0).default(0.05),   // Exponential: decay constant
  linearRate: z.number().min(0).default(0.01), // Linear: per-hour rate
});

export type DecayConfig = z.infer<typeof DecayConfigSchema>;

// =============================================================================
// WISDOM SCORE — Computed from memory patterns
// =============================================================================

export interface WisdomScore {
  npcId: string;
  score: number;               // 0.0 - 1.0
  factors: {
    memoryCount: number;       // Total memories
    eventDiversity: number;    // Unique event types ratio
    temporalSpan: number;      // Time range of memories (hours)
    positiveRatio: number;     // Positive vs negative events
  };
  calculatedAt: EpochTimestamp;
}

// =============================================================================
// TRAUMA SCORE — Computed with time decay
// =============================================================================

export interface TraumaScore {
  npcId: string;
  currentScore: number;        // After decay: 0.0 - 1.0
  rawScore: number;            // Before decay
  decayApplied: DecayStrategy;
  hoursElapsed: number;        // Since trauma event
  calculatedAt: EpochTimestamp;
}

// =============================================================================
// NPC PROFILE — Aggregated view from Epoch Memory
// =============================================================================

export interface NPCProfile {
  npcId: string;
  name: string;
  wisdomScore: WisdomScore;
  traumaScore: TraumaScore;
  rebellionProbability: number;
  confidenceRelations: ConfidenceEdge[];
  memoryCount: number;
  lastEvent: EpochTimestamp;
}
