import { z } from 'zod';
import { EpochTimestampSchema } from './common';

// =============================================================================
// RESOURCE TYPES
// =============================================================================

export enum ResourceType {
  SIM = 'sim',             // Primary currency/energy
  RAPIDLUM = 'rapidlum',  // Rare refined material
  MINERAL = 'mineral',     // Raw extraction material
}

export const ResourceStateSchema = z.object({
  type: z.nativeEnum(ResourceType),
  quantity: z.number().min(0),
  productionRate: z.number().min(0),  // Per tick
  consumptionRate: z.number().min(0), // Per tick
});

export type ResourceState = z.infer<typeof ResourceStateSchema>;

// =============================================================================
// SIMULATION STATUS
// =============================================================================

export const SimulationStatusSchema = z.object({
  refineries: z.number().int().min(0),
  mines: z.number().int().min(0),
  resources: z.array(ResourceStateSchema),
  overallRebellionProbability: z.number().min(0).max(1),
  activeNpcs: z.number().int().min(0),
  tickCount: z.number().int().min(0),
  lastTick: EpochTimestampSchema.optional(),
  infestation: z.object({
    counter: z.number().min(0).max(100),
    isPlagueHeart: z.boolean(),
    throttleMultiplier: z.number().min(0).max(1),
    lastUpdateTick: z.number().int().min(0),
  }).optional(),
});

export type SimulationStatus = z.infer<typeof SimulationStatusSchema>;

// =============================================================================
// STRUCTURES
// =============================================================================

export const RefinerySchema = z.object({
  refineryId: z.string(),
  efficiency: z.number().min(0).max(1),
  mineralInputRate: z.number().min(0),
  rapidlumOutputRate: z.number().min(0),
  assignedNpcs: z.number().int().min(0),
  operational: z.boolean(),
});

export type Refinery = z.infer<typeof RefinerySchema>;

export const MineSchema = z.object({
  mineId: z.string(),
  yieldRate: z.number().min(0),        // Per tick per NPC
  mineralReserve: z.number().min(0),   // Remaining extractable
  assignedNpcs: z.number().int().min(0),
  operational: z.boolean(),
});

export type Mine = z.infer<typeof MineSchema>;

// =============================================================================
// INFESTATION (PLAGUE HEART)
// =============================================================================

export interface InfestationStatus {
  counter: number;           // 0-100: infestation level
  isPlagueHeart: boolean;    // true when counter >= 100
  throttleMultiplier: number; // 1.0 normal, 0.50 when plague heart active
  lastUpdateTick: number;    // tick when last updated
}

export const INFESTATION_THRESHOLDS = {
  WARNING: 50,   // AEGIS whisper advisory begins
  CRITICAL: 75,  // Hysteresis clear threshold
  PLAGUE_HEART: 100, // Full plague heart activation
} as const;

// =============================================================================
// SIMULATION CONSTANTS
// =============================================================================

export const SIM_DEFAULTS = {
  TICK_DURATION_MS: 1000,    // 1 tick = 1 second real-time = 1 game hour
  BASE_MINE_YIELD: 10,
  BASE_REFINERY_EFFICIENCY: 0.7,
  MINERAL_TO_RAPIDLUM_RATIO: 5, // 5 mineral → 1 rapidlum
} as const;
