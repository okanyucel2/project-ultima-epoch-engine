// =============================================================================
// Neural Mesh Types — Coordinator pipeline data structures
// =============================================================================

import { EventTier } from '@epoch/shared/ai-router';
import type { EpochTimestamp } from '@epoch/shared/common';

// =============================================================================
// MeshEvent — Input to the Neural Mesh pipeline
// =============================================================================

export interface MeshEvent {
  /** Unique event identifier */
  eventId: string;
  /** The NPC this event relates to */
  npcId: string;
  /** Event type (maps to EventClassifier types) */
  eventType: string;
  /** Human-readable description for LLM prompt */
  description: string;
  /** Urgency override (0-1). > 0.8 escalates to STRATEGIC */
  urgency?: number;
  /** Arbitrary metadata for context */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// MeshResponse — Output from the Neural Mesh pipeline
// =============================================================================

export interface MeshResponse {
  /** Correlates to the input MeshEvent.eventId */
  eventId: string;
  /** Which AI tier handled this event */
  tier: EventTier;
  /** Raw AI response text */
  aiResponse: string;
  /** Rebellion probability check from logistics */
  rebellionCheck: {
    probability: number;
    thresholdExceeded: boolean;
  };
  /** Whether Cognitive Rails vetoed this response */
  vetoApplied: boolean;
  /** Reason for veto if vetoApplied is true */
  vetoReason?: string;
  /** Total pipeline processing time in milliseconds */
  processingTimeMs: number;
}

// =============================================================================
// CognitiveRailResult — Output from a single rail check
// =============================================================================

export interface CognitiveRailResult {
  /** Whether the check passed (true = allowed, false = vetoed) */
  allowed: boolean;
  /** Reason for veto or warning */
  vetoReason?: string;
  /** Which rule was violated */
  ruleViolated?: string;
}

// =============================================================================
// VetoDecision — Recorded when Cognitive Rails blocks an action
// =============================================================================

export interface VetoDecision {
  /** The event that was vetoed */
  eventId: string;
  /** The NPC whose action was vetoed */
  npcId: string;
  /** Human-readable reason for the veto */
  reason: string;
  /** Rebellion probability at time of veto */
  rebellionProbability: number;
  /** When the veto occurred */
  timestamp: EpochTimestamp;
  /** Whether this veto was issued by AEGIS infestation rail */
  vetoedByAegis?: boolean;
  /** Infestation level at time of veto */
  infestationLevel?: number;
}
