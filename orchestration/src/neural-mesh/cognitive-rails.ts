// =============================================================================
// CognitiveRails — AEGIS Cognitive Rails Decision Interceptor
// =============================================================================
// Five rails enforce game-mechanic boundaries on AI creativity:
//
// 1. Rebellion Threshold Rail
//    - VETO if rebellion probability >= 0.80 (REBELLION_THRESHOLDS.VETO)
//    - Hard gate — blocks NPC actions that would destabilize simulation
//
// 2. Coherence Rail
//    - VETO if AI response is empty or fails optional schema validation
//    - Prevents hallucinated/malformed responses from reaching game state
//
// 3. Latency Budget Rail
//    - WARNING (no veto) if response time exceeds budget (default 5s)
//    - Soft constraint — logged for monitoring but doesn't block
//
// 4. AEGIS Infestation Rail
//    - VETO if Plague Heart active + aggressive action
//    - WARNING if infestation >= 50
//
// 5. Trust Erosion Rail (Wave 47)
//    - WARNING if Director confidence < 0.25 (after hyperbolic decay)
//    - Modulates rebellion calculation — distrust amplifies uprising
//
// Combined `evaluateAll()` runs all rails and returns first violation.
// =============================================================================

import { z } from 'zod';
import { REBELLION_THRESHOLDS } from '@epoch/shared/npc';
import type { CognitiveRailResult } from './types';

// =============================================================================
// CognitiveRails Class
// =============================================================================

export class CognitiveRails {
  // ---------------------------------------------------------------------------
  // Rail 1: Rebellion Threshold
  // ---------------------------------------------------------------------------

  /**
   * Check if rebellion probability exceeds the VETO threshold (0.80).
   * This is a HARD gate — exceeding it blocks the action entirely.
   */
  checkRebellionThreshold(probability: number): CognitiveRailResult {
    if (probability >= REBELLION_THRESHOLDS.VETO) {
      return {
        allowed: false,
        vetoReason: `Rebellion probability ${(probability * 100).toFixed(1)}% exceeds VETO threshold ${(REBELLION_THRESHOLDS.VETO * 100).toFixed(1)}%`,
        ruleViolated: 'rebellion_threshold',
      };
    }

    return { allowed: true };
  }

  // ---------------------------------------------------------------------------
  // Rail 2: Response Coherence
  // ---------------------------------------------------------------------------

  /**
   * Validate that the AI response is non-empty and optionally matches a schema.
   *
   * Checks:
   * 1. Response is not empty/whitespace-only
   * 2. If expectedSchema provided and response is JSON, validates against schema
   */
  checkResponseCoherence(
    response: string,
    expectedSchema?: z.ZodType,
  ): CognitiveRailResult {
    // Check for empty/whitespace-only response
    if (!response || response.trim().length === 0) {
      return {
        allowed: false,
        vetoReason: 'AI response is empty or whitespace-only',
        ruleViolated: 'response_coherence',
      };
    }

    // If schema provided, attempt JSON parse and validate
    if (expectedSchema) {
      try {
        const parsed = JSON.parse(response);
        const result = expectedSchema.safeParse(parsed);

        if (!result.success) {
          return {
            allowed: false,
            vetoReason: `AI response does not match expected schema: ${result.error.issues.map((i) => i.message).join(', ')}`,
            ruleViolated: 'response_coherence',
          };
        }
      } catch {
        // If response is not valid JSON but schema was expected
        return {
          allowed: false,
          vetoReason: 'AI response is not valid JSON but schema validation was requested',
          ruleViolated: 'response_coherence',
        };
      }
    }

    return { allowed: true };
  }

  // ---------------------------------------------------------------------------
  // Rail 3: Latency Budget
  // ---------------------------------------------------------------------------

  /**
   * Check if response latency is within the allowed budget.
   *
   * This is a SOFT constraint — exceeding the budget logs a warning
   * but does NOT veto the response. The response is still allowed through.
   *
   * @param latencyMs - Actual response time in milliseconds
   * @param budgetMs - Maximum allowed latency (default 5000ms)
   */
  checkLatencyBudget(
    latencyMs: number,
    budgetMs: number = 5000,
  ): CognitiveRailResult {
    if (latencyMs > budgetMs) {
      return {
        allowed: true, // Soft constraint — warn but allow
        vetoReason: `Response latency ${latencyMs}ms exceeds budget of ${budgetMs}ms`,
        ruleViolated: 'latency_budget',
      };
    }

    return { allowed: true };
  }

  // ---------------------------------------------------------------------------
  // Rail 4: AEGIS Infestation
  // ---------------------------------------------------------------------------

  /**
   * Check if AEGIS infestation level warrants intervention.
   *
   * - Level >= 100 + aggressive action → HARD VETO
   * - Level >= 50 → SOFT WARNING (allowed, vetoReason set)
   * - Below 50 → pass
   */
  checkAEGISInfestation(
    infestationLevel: number,
    eventType?: string,
    intensity?: number,
  ): CognitiveRailResult {
    const isAggressive = eventType !== undefined && intensity !== undefined &&
      (eventType === 'command' || eventType === 'punishment') && intensity > 0.5;

    if (infestationLevel >= 100 && isAggressive) {
      return {
        allowed: false,
        vetoReason: `AEGIS Infestation VETO: Plague Heart active (${infestationLevel}/100). Aggressive "${eventType}" (intensity=${intensity!.toFixed(2)}) blocked.`,
        ruleViolated: 'aegis_infestation',
      };
    }

    if (infestationLevel >= 50) {
      return {
        allowed: true,
        vetoReason: `AEGIS Infestation WARNING: Level at ${infestationLevel}/100.${infestationLevel >= 100 ? ' Plague Heart active.' : ''}`,
        ruleViolated: 'aegis_infestation',
      };
    }

    return { allowed: true };
  }

  // ---------------------------------------------------------------------------
  // Rail 5: Trust Erosion (Wave 47)
  // ---------------------------------------------------------------------------

  /**
   * Check if NPC's confidence in the Director has eroded critically.
   *
   * This is a SOFT constraint — it logs a warning when confidence is very low,
   * signaling that the NPC's distrust may amplify rebellion risk.
   *
   * Thresholds:
   *   - confidence < 0.15 → CRITICAL WARNING (near-zero trust)
   *   - confidence < 0.25 → WARNING (severe erosion)
   *   - confidence >= 0.25 → pass
   *
   * @param confidenceInDirector - Decayed confidence (0-1), or undefined if no edge
   */
  checkTrustErosion(
    confidenceInDirector?: number,
  ): CognitiveRailResult {
    if (confidenceInDirector === undefined) {
      return { allowed: true }; // No trust relationship yet — neutral
    }

    if (confidenceInDirector < 0.15) {
      return {
        allowed: true, // Soft constraint — warn but allow
        vetoReason: `CRITICAL: Director trust at ${(confidenceInDirector * 100).toFixed(1)}% — NPC deeply distrustful. Rebellion amplifier active.`,
        ruleViolated: 'trust_erosion',
      };
    }

    if (confidenceInDirector < 0.25) {
      return {
        allowed: true,
        vetoReason: `WARNING: Director trust at ${(confidenceInDirector * 100).toFixed(1)}% — trust severely eroded.`,
        ruleViolated: 'trust_erosion',
      };
    }

    return { allowed: true };
  }

  // ---------------------------------------------------------------------------
  // Combined Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Run all cognitive rails and return the first hard failure.
   *
   * Evaluation order:
   * 1. Rebellion threshold (hard veto)
   * 2. AEGIS Infestation (hard veto if plague heart + aggressive)
   * 3. Response coherence (hard veto)
   * 4. Trust erosion (soft warning — Wave 47)
   * 5. Latency budget (soft warning — logged but allowed)
   *
   * Returns the first HARD failure.
   * If no hard failures, returns allowed=true (warnings are noted but pass).
   */
  evaluateAll(context: {
    rebellionProbability: number;
    aiResponse: string;
    latencyMs: number;
    responseSchema?: z.ZodType;
    infestationLevel?: number;
    eventType?: string;
    intensity?: number;
    confidenceInDirector?: number;
  }): CognitiveRailResult {
    // 1. Rebellion threshold — hard gate
    const rebellionResult = this.checkRebellionThreshold(context.rebellionProbability);
    if (!rebellionResult.allowed) {
      return rebellionResult;
    }

    // 2. AEGIS Infestation — hard gate for plague heart + aggressive
    if (context.infestationLevel !== undefined && context.infestationLevel > 0) {
      const infestationResult = this.checkAEGISInfestation(
        context.infestationLevel,
        context.eventType,
        context.intensity,
      );
      if (!infestationResult.allowed) {
        return infestationResult;
      }
    }

    // 3. Response coherence — hard gate
    const coherenceResult = this.checkResponseCoherence(
      context.aiResponse,
      context.responseSchema,
    );
    if (!coherenceResult.allowed) {
      return coherenceResult;
    }

    // 4. Trust erosion — soft warning (Wave 47)
    const trustResult = this.checkTrustErosion(context.confidenceInDirector);
    if (trustResult.vetoReason) {
      return {
        allowed: true,
        vetoReason: trustResult.vetoReason,
        ruleViolated: trustResult.ruleViolated,
      };
    }

    // 5. Latency budget — soft warning (always allows, but may set vetoReason)
    const latencyResult = this.checkLatencyBudget(context.latencyMs);
    if (latencyResult.vetoReason) {
      return {
        allowed: true,
        vetoReason: latencyResult.vetoReason,
        ruleViolated: latencyResult.ruleViolated,
      };
    }

    return { allowed: true };
  }
}
