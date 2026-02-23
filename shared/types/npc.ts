import { z } from 'zod';
import { EpochTimestampSchema, type EpochTimestamp } from './common';

// =============================================================================
// NPC STATE
// =============================================================================

export const NPCStateSchema = z.object({
  npcId: z.string(),
  name: z.string(),
  wisdomScore: z.number().min(0).max(1),
  traumaScore: z.number().min(0).max(1),
  rebellionProbability: z.number().min(0).max(1),
  workEfficiency: z.number().min(0).max(1),
  morale: z.number().min(0).max(1),
  memoryCount: z.number().int().min(0),
  lastEvent: EpochTimestampSchema.optional(),
});

export type NPCState = z.infer<typeof NPCStateSchema>;

// =============================================================================
// NPC ACTIONS — Player/Director interactions
// =============================================================================

export enum ActionType {
  COMMAND = 'command',
  RESOURCE_CHANGE = 'resource_change',
  PUNISHMENT = 'punishment',
  REWARD = 'reward',
  DIALOGUE = 'dialogue',
  ENVIRONMENT = 'environment',
}

export const NPCActionSchema = z.object({
  actionId: z.string(),
  npcId: z.string(),
  actionType: z.nativeEnum(ActionType),
  description: z.string(),
  intensity: z.number().min(0).max(1),
  timestamp: EpochTimestampSchema,
  metadata: z.record(z.string()).optional(),
});

export type NPCAction = z.infer<typeof NPCActionSchema>;

// =============================================================================
// REBELLION
// =============================================================================

export enum RebellionType {
  PASSIVE = 'passive',       // Work slowdown
  ACTIVE = 'active',         // Open defiance
  COLLECTIVE = 'collective', // Multi-NPC coordinated
}

export const RebellionEventSchema = z.object({
  eventId: z.string(),
  npcId: z.string(),
  probabilityAtTrigger: z.number().min(0).max(1),
  rebellionType: z.nativeEnum(RebellionType),
  triggerActionId: z.string(),
  timestamp: EpochTimestampSchema,
  vetoedByAegis: z.boolean().default(false),
  vetoReason: z.string().optional(),
});

export type RebellionEvent = z.infer<typeof RebellionEventSchema>;

// =============================================================================
// REBELLION FACTORS — Breakdown of probability calculation
// =============================================================================

export const RebellionFactorsSchema = z.object({
  base: z.number(),           // 0.05 baseline
  traumaModifier: z.number(), // avgTrauma * 0.3
  efficiencyModifier: z.number(), // (1 - efficiency) * 0.3
  moraleModifier: z.number(), // (1 - morale) * 0.2
});

export type RebellionFactors = z.infer<typeof RebellionFactorsSchema>;

// =============================================================================
// REBELLION THRESHOLDS
// =============================================================================

export const REBELLION_THRESHOLDS = {
  CONSIDERATION: 0.20,  // NPC starts considering rebellion
  WARNING: 0.35,        // Process halt threshold (per spec: +30%)
  CRITICAL: 0.60,       // High risk — AEGIS monitors closely
  VETO: 0.80,          // Cognitive Rails veto threshold
} as const;
