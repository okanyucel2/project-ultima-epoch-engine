import { z } from 'zod';
import {
  UnitFloat,
  SeveritySchema,
  MentalBreakdownTypeSchema,
  PermanentTraumaTypeSchema,
} from './common';
import { NPCEventSchema } from './npc-events';

// =============================================================================
// TELEMETRY CHANNEL — Millisecond-precision psychological & physical events
// =============================================================================

const MentalBreakdownSchema = z.object({
  breakdownType: MentalBreakdownTypeSchema,
  intensity: UnitFloat,
  stressBefore: UnitFloat,
  stressAfter: UnitFloat,
  triggerContext: z.string(),
  resolved: z.boolean(),
  recoveryProbability: UnitFloat,
});

const PermanentTraumaSchema = z.object({
  traumaType: PermanentTraumaTypeSchema,
  severity: UnitFloat,
  affectedAttribute: z.string(),
  attributeReduction: z.number().min(0),
  triggerContext: z.string(),
  phobiaTarget: z.string().nullable(),
});

const StateChangeSchema = z.object({
  attribute: z.string(),
  oldValue: z.number(),
  newValue: z.number(),
  cause: z.string(),
});

export const TelemetryEventSchema = z.object({
  eventId: z.string(),
  npcId: z.string(),
  severity: SeveritySchema,
  type: z.enum(['mental_breakdown', 'permanent_trauma', 'state_change']),
  mentalBreakdown: MentalBreakdownSchema.optional(),
  permanentTrauma: PermanentTraumaSchema.optional(),
  stateChange: StateChangeSchema.optional(),
  npcSnapshot: NPCEventSchema.optional(),
});

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type MentalBreakdown = z.infer<typeof MentalBreakdownSchema>;
export type PermanentTrauma = z.infer<typeof PermanentTraumaSchema>;
export type StateChange = z.infer<typeof StateChangeSchema>;
