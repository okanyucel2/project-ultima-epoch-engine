import { z } from 'zod';
import { UnitFloat, NPCStatusSchema } from './common';

// =============================================================================
// NPC EVENTS CHANNEL — Real-time NPC state updates
// =============================================================================

export const NPCEventSchema = z.object({
  npcId: z.string(),
  name: z.string(),
  wisdomScore: UnitFloat,
  traumaScore: UnitFloat,
  rebellionProbability: UnitFloat,
  confidenceInDirector: UnitFloat,
  workEfficiency: UnitFloat.optional().default(1.0),
  morale: UnitFloat.optional().default(0.5),
  memoryCount: z.number().int().nonnegative(),
  status: NPCStatusSchema,
});

export type NPCEvent = z.infer<typeof NPCEventSchema>;
