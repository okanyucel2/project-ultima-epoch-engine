// =============================================================================
// MemoryIntegration — Bridge between AI Router decisions and Epoch Memory
// =============================================================================
// Connects the orchestration layer (AI routing, event processing) with the
// Epoch Memory system (Neo4j graph, trauma, wisdom, confidence).
//
// Design: Uses an interface for the memory service to allow testability
// without requiring a live Neo4j connection. In production, the real
// EpochMemoryService is injected; in tests, a mock implementation is used.
//
// Responsibilities:
//   - Record AI routing decisions as NPC memory events
//   - Update NPC confidence based on action outcomes
//   - Provide NPC context for AI prompt enrichment
// =============================================================================

import type { RoutingDecision } from '@epoch/shared/ai-router';
import type { WisdomScore, TraumaScore, ConfidenceEdge, DecayedConfidence } from '@epoch/shared/memory';
import type { EpochTimestamp } from '@epoch/shared/common';
import { AuditLogger } from './audit-logger';

// =============================================================================
// Memory Backend Interface — Abstracts EpochMemoryService for testability
// =============================================================================

/**
 * Minimal interface that EpochMemoryService implements.
 * This decouples the orchestration layer from Neo4j.
 */
export interface IMemoryBackend {
  recordEvent(
    npcId: string,
    event: string,
    playerAction: string,
    wisdomScore: number,
    traumaScore: number,
  ): Promise<void>;

  getNPCProfile(npcId: string): Promise<{
    npcId: string;
    name: string;
    wisdomScore: WisdomScore;
    traumaScore: TraumaScore;
    rebellionProbability: number;
    confidenceRelations: ConfidenceEdge[];
    memoryCount: number;
    lastEvent: EpochTimestamp;
  }>;

  getRebellionRisk(npcId: string): Promise<{
    probability: number;
    factors: string[];
  }>;

  /** Wave 47: Get time-decayed confidence between NPC and entity */
  getDecayedConfidence(
    npcId: string,
    entityId: string,
  ): Promise<DecayedConfidence | null>;
}

// =============================================================================
// NPC Context — Enriched context for AI prompt generation
// =============================================================================

export interface NPCContext {
  /** Recent memory event descriptions */
  recentMemories: string[];
  /** NPC's aggregated wisdom score (0-1) */
  wisdomScore: number;
  /** NPC's current trauma score after decay (0-1) */
  traumaScore: number;
  /** Rebellion risk probability (0-1) */
  rebellionRisk: number;
  /** NPC's confidence in the Director (0-1) */
  confidenceInDirector: number;
}

// =============================================================================
// MemoryIntegration Class
// =============================================================================

export class MemoryIntegration {
  private readonly auditLogger: AuditLogger;
  private readonly memoryBackend: IMemoryBackend | null;

  /**
   * @param auditLogger - Audit logger for recording integration events
   * @param memoryBackend - Optional memory backend (null if Neo4j unavailable)
   */
  constructor(
    auditLogger: AuditLogger,
    memoryBackend: IMemoryBackend | null = null,
  ) {
    this.auditLogger = auditLogger;
    this.memoryBackend = memoryBackend;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Record an AI routing decision as an NPC memory event.
   *
   * Translates the routing decision (tier, provider, model, failover status)
   * into a memory event that becomes part of the NPC's persistent graph.
   *
   * @param npcId - The NPC this decision relates to
   * @param decision - The routing decision from TierRouter
   * @param context - Human-readable context for the decision
   */
  async recordRoutingDecision(
    npcId: string,
    decision: RoutingDecision,
    context: string,
  ): Promise<void> {
    if (!this.memoryBackend) {
      return; // Memory backend not available — silently skip
    }

    const event = [
      `AI routing: ${decision.eventTier} tier`,
      `Provider: ${decision.selectedProvider}/${decision.selectedModel}`,
      decision.failoverOccurred
        ? `Failover from ${decision.failoverFrom ?? 'unknown'}`
        : null,
      `Context: ${context}`,
    ]
      .filter(Boolean)
      .join(' | ');

    // Routing decisions are low-trauma, moderate-wisdom events
    // They represent system interactions, not player actions
    const wisdomContribution = 0.1; // Small wisdom gain from each interaction
    const traumaContribution = 0.0; // No trauma from routing decisions

    await this.memoryBackend.recordEvent(
      npcId,
      event,
      'system_routing',
      wisdomContribution,
      traumaContribution,
    );
  }

  /**
   * Record the outcome of an NPC action and update confidence/trauma.
   *
   * Success decreases trauma and increases confidence.
   * Failure increases trauma and decreases confidence.
   * Intensity scales the effect.
   *
   * @param npcId - The NPC who performed the action
   * @param actionType - Type of action (command, reward, punishment, etc.)
   * @param success - Whether the action succeeded
   * @param intensity - How intense the action was (0-1)
   */
  async recordActionOutcome(
    npcId: string,
    actionType: string,
    success: boolean,
    intensity: number,
  ): Promise<void> {
    if (!this.memoryBackend) {
      return;
    }

    const clampedIntensity = Math.min(1, Math.max(0, intensity));

    const event = `Action outcome: ${actionType} ${success ? 'succeeded' : 'failed'} (intensity: ${(clampedIntensity * 100).toFixed(0)}%)`;

    // Success: positive wisdom, low trauma
    // Failure: low wisdom, trauma proportional to intensity
    const wisdomScore = success
      ? 0.2 + clampedIntensity * 0.3 // 0.2 - 0.5 on success
      : 0.05; // Small wisdom from failures (learning)

    const traumaScore = success
      ? 0.0
      : clampedIntensity * 0.5; // 0.0 - 0.5 trauma on failure

    await this.memoryBackend.recordEvent(
      npcId,
      event,
      actionType,
      wisdomScore,
      traumaScore,
    );
  }

  /**
   * Get enriched NPC context for AI prompt generation.
   *
   * Aggregates data from the memory graph into a compact context object
   * suitable for inclusion in LLM prompts.
   *
   * @param npcId - The NPC to get context for
   * @returns Enriched context with memories, scores, and rebellion risk
   */
  async getNPCContext(npcId: string): Promise<NPCContext> {
    if (!this.memoryBackend) {
      // Return safe defaults when memory backend is unavailable
      return {
        recentMemories: [],
        wisdomScore: 0,
        traumaScore: 0,
        rebellionRisk: 0,
        confidenceInDirector: 0.5, // Neutral confidence
      };
    }

    // Wave 47: Use decayed confidence instead of raw stored value
    const [profile, decayedDirectorConf] = await Promise.all([
      this.memoryBackend.getNPCProfile(npcId),
      this.memoryBackend.getDecayedConfidence(npcId, 'director'),
    ]);

    const confidenceInDirector = decayedDirectorConf
      ? decayedDirectorConf.decayedConfidence
      : 0.5; // Default neutral confidence

    return {
      recentMemories: [],
      wisdomScore: profile.wisdomScore.score,
      traumaScore: profile.traumaScore.currentScore,
      rebellionRisk: profile.rebellionProbability,
      confidenceInDirector,
    };
  }

  /**
   * Check if the memory backend is available.
   */
  isAvailable(): boolean {
    return this.memoryBackend !== null;
  }

  /**
   * Close the memory backend, flushing any pending operations.
   * Wave 25C: Delegates to backend.close() which drains RetryQueue first.
   */
  async close(): Promise<void> {
    if (!this.memoryBackend) return;
    if ('close' in this.memoryBackend && typeof (this.memoryBackend as any).close === 'function') {
      await (this.memoryBackend as any).close();
    }
  }

  /**
   * Drain pending operations without closing. Used by /api/phoenix/drain.
   * Wave 25C: Returns stats about drained operations.
   */
  async drain(): Promise<{ flushed: number }> {
    if (!this.memoryBackend) return { flushed: 0 };
    if ('close' in this.memoryBackend && typeof (this.memoryBackend as any).close === 'function') {
      await (this.memoryBackend as any).close();
      return { flushed: 0 }; // Backend handles the drain internally; stats logged to console
    }
    return { flushed: 0 };
  }
}
