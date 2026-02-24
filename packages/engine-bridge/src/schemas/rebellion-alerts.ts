import { z } from 'zod';
import { UnitFloat, RebellionTypeSchema } from './common';

// =============================================================================
// REBELLION ALERTS CHANNEL — High-priority rebellion threshold events
// =============================================================================

export const RebellionAlertSchema = z.object({
  eventId: z.string(),
  npcId: z.string(),
  npcName: z.string(),
  probability: UnitFloat,
  rebellionType: RebellionTypeSchema,
  triggerActionId: z.string(),
  vetoedByAegis: z.boolean(),
  vetoReason: z.string().nullable(),
});

export type RebellionAlert = z.infer<typeof RebellionAlertSchema>;
