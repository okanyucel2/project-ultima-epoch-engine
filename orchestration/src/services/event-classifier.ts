// =============================================================================
// EventClassifier — Game Event to AI Tier Classification
// =============================================================================
// Maps incoming game events to the appropriate AI Judgment Matrix tier:
//   ROUTINE:     telemetry, heartbeat, status_check, metrics
//   OPERATIONAL: resource_decision, npc_query, work_assignment, trade
//   STRATEGIC:   rebellion_analysis, psychology_synthesis, dialogue_deep,
//                collective_action
//
// High urgency (>0.8) escalates ANY event to STRATEGIC.
// Unknown event types default to OPERATIONAL (safe middle ground).
// =============================================================================

import { z } from 'zod';
import { EventTier } from '../../shared/types/ai-router';

// =============================================================================
// GameEvent Schema (Zod-validated)
// =============================================================================

export const GameEventSchema = z.object({
  type: z.string().min(1),
  npcId: z.string().optional(),
  description: z.string(),
  urgency: z.number().min(0).max(1).optional(),
});

export type GameEvent = z.infer<typeof GameEventSchema>;

// =============================================================================
// Tier Classification Maps
// =============================================================================

const ROUTINE_EVENTS = new Set<string>([
  'telemetry',
  'heartbeat',
  'status_check',
  'metrics',
]);

const OPERATIONAL_EVENTS = new Set<string>([
  'resource_decision',
  'npc_query',
  'work_assignment',
  'trade',
]);

const STRATEGIC_EVENTS = new Set<string>([
  'rebellion_analysis',
  'psychology_synthesis',
  'dialogue_deep',
  'collective_action',
]);

/** Urgency threshold above which ANY event escalates to STRATEGIC. */
const URGENCY_ESCALATION_THRESHOLD = 0.8;

// =============================================================================
// EventClassifier Class
// =============================================================================

export class EventClassifier {
  /**
   * Classify a game event into an AI Judgment Matrix tier.
   *
   * Classification priority:
   * 1. High urgency (>0.8) → always STRATEGIC
   * 2. Known event type → mapped tier
   * 3. Unknown event type → OPERATIONAL (safe default)
   *
   * @param event - The game event to classify (validated with Zod)
   * @returns The appropriate EventTier
   */
  classify(event: GameEvent): EventTier {
    // Validate the event against the schema
    const validated = GameEventSchema.parse(event);

    // High urgency escalates everything to STRATEGIC
    if (
      validated.urgency !== undefined &&
      validated.urgency > URGENCY_ESCALATION_THRESHOLD
    ) {
      return EventTier.STRATEGIC;
    }

    // Check known event type mappings
    const eventType = validated.type.toLowerCase();

    if (STRATEGIC_EVENTS.has(eventType)) {
      return EventTier.STRATEGIC;
    }

    if (OPERATIONAL_EVENTS.has(eventType)) {
      return EventTier.OPERATIONAL;
    }

    if (ROUTINE_EVENTS.has(eventType)) {
      return EventTier.ROUTINE;
    }

    // Unknown event type: default to OPERATIONAL (safe middle ground)
    return EventTier.OPERATIONAL;
  }
}
