import { z } from 'zod';

// =============================================================================
// COMMON SCHEMAS — Shared types across all channels
// =============================================================================

export const EpochTimestampSchema = z.object({
  iso8601: z.string(),
  unixMs: z.number().int(),
});

/** 0.0 - 1.0 normalized value */
export const UnitFloat = z.number().min(0).max(1);

/** NPC status enum */
export const NPCStatusSchema = z.enum(['active', 'idle', 'rebelling']);

/** Telemetry severity levels */
export const SeveritySchema = z.enum(['info', 'warning', 'critical', 'catastrophic']);

/** Rebellion type enum */
export const RebellionTypeSchema = z.enum(['passive', 'active', 'collective']);

/** Mental breakdown types (The Alters model — transient) */
export const MentalBreakdownTypeSchema = z.enum([
  'stress_spike',
  'psychological_fracture',
  'identity_crisis',
  'paranoia_onset',
  'dissociation',
  'rage_episode',
]);

/** Permanent trauma types (Battle Brothers model — irreversible) */
export const PermanentTraumaTypeSchema = z.enum([
  'limb_loss',
  'morale_collapse',
  'ptsd',
  'survivors_guilt',
  'phobia',
  'brain_damage',
]);

/** WebSocket envelope — wraps every message from the server */
export const EnvelopeSchema = z.object({
  channel: z.string(),
  data: z.record(z.unknown()),
  timestamp: z.string().datetime({ offset: true }).or(z.string()),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;
export type NPCStatus = z.infer<typeof NPCStatusSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type RebellionType = z.infer<typeof RebellionTypeSchema>;
export type MentalBreakdownType = z.infer<typeof MentalBreakdownTypeSchema>;
export type PermanentTraumaType = z.infer<typeof PermanentTraumaTypeSchema>;
