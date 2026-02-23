// =============================================================================
// NeuralMeshCoordinator — The core Neural Mesh orchestration pipeline
// =============================================================================
// Main pipeline for processing game events through the AI Judgment Matrix:
//
//   1. Classify event → determine AI tier (Routine/Operational/Strategic)
//   2. Route tier → select provider/model (with circuit breaker failover)
//   3. Call LLM → get AI response via resilient client
//   4. Rebellion check → query logistics backend for NPC rebellion probability
//   5. Cognitive Rails → validate response (rebellion threshold, coherence, latency)
//   6. Broadcast → send to appropriate WebSocket channel
//   7. Audit → log everything to ring buffer
//
// If Cognitive Rails VETO:
//   - Broadcast to 'cognitive-rails' channel
//   - Return veto response (no game state change)
//
// If PASS:
//   - Broadcast to 'npc-events' channel
//   - Return AI response for game state application
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import { EventTier } from '../../shared/types/ai-router';
import { createTimestamp } from '../../shared/types/common';
import { EventClassifier } from '../services/event-classifier';
import type { GameEvent } from '../services/event-classifier';
import { TierRouter } from '../services/tier-router';
import { ResilientLLMClient } from '../services/resilient-client';
import { LogisticsClient } from '../services/logistics-client';
import { AuditLogger } from '../services/audit-logger';
import { EpochWebSocketServer } from '../services/websocket-server';
import { CognitiveRails } from './cognitive-rails';
import type { MeshEvent, MeshResponse, VetoDecision } from './types';

// =============================================================================
// NeuralMeshCoordinator Class
// =============================================================================

export class NeuralMeshCoordinator {
  private readonly classifier: EventClassifier;
  private readonly router: TierRouter;
  private readonly llmClient: ResilientLLMClient;
  private readonly logisticsClient: LogisticsClient;
  private readonly cognitiveRails: CognitiveRails;
  private readonly auditLogger: AuditLogger;
  private readonly wsServer: EpochWebSocketServer;

  constructor(
    classifier: EventClassifier,
    router: TierRouter,
    llmClient: ResilientLLMClient,
    logisticsClient: LogisticsClient,
    cognitiveRails: CognitiveRails,
    auditLogger: AuditLogger,
    wsServer: EpochWebSocketServer,
  ) {
    this.classifier = classifier;
    this.router = router;
    this.llmClient = llmClient;
    this.logisticsClient = logisticsClient;
    this.cognitiveRails = cognitiveRails;
    this.auditLogger = auditLogger;
    this.wsServer = wsServer;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Process a single event through the full Neural Mesh pipeline.
   *
   * Pipeline:
   * classify → route → LLM → rebellion check → cognitive rails → broadcast
   */
  async processEvent(event: MeshEvent): Promise<MeshResponse> {
    const startTime = Date.now();

    // Step 1: Classify event → get AI tier
    const gameEvent: GameEvent = {
      type: event.eventType,
      npcId: event.npcId,
      description: event.description,
      urgency: event.urgency,
    };
    const tier = this.classifier.classify(gameEvent);

    // Step 2 + 3: Route and call LLM
    const prompt = this.buildPrompt(event, tier);
    const llmResponse = await this.llmClient.complete(tier, prompt);

    // Step 4: Get rebellion probability from logistics
    const rebellionCheck = await this.getRebellionSafe(event.npcId);

    // Step 5: Run cognitive rails
    const processingTimeMs = Date.now() - startTime;
    const railResult = this.cognitiveRails.evaluateAll({
      rebellionProbability: rebellionCheck.probability,
      aiResponse: llmResponse.content,
      latencyMs: processingTimeMs,
    });

    // Step 6: Build response based on rail result
    const response: MeshResponse = {
      eventId: event.eventId,
      tier,
      aiResponse: railResult.allowed ? llmResponse.content : `[VETOED] ${railResult.vetoReason}`,
      rebellionCheck: {
        probability: rebellionCheck.probability,
        thresholdExceeded: rebellionCheck.thresholdExceeded,
      },
      vetoApplied: !railResult.allowed,
      vetoReason: !railResult.allowed ? railResult.vetoReason : undefined,
      processingTimeMs: Date.now() - startTime,
    };

    // Step 7: Broadcast to appropriate channel
    if (response.vetoApplied) {
      this.wsServer.broadcast('cognitive-rails', response);

      // Record veto decision for audit trail
      const veto: VetoDecision = {
        eventId: event.eventId,
        npcId: event.npcId,
        reason: response.vetoReason || 'Unknown veto reason',
        rebellionProbability: rebellionCheck.probability,
        timestamp: createTimestamp(),
      };
      this.wsServer.broadcast('rebellion-alerts', veto);
    } else {
      this.wsServer.broadcast('npc-events', response);
    }

    return response;
  }

  /**
   * Process multiple events concurrently.
   * Each event goes through the full pipeline independently.
   */
  async processBatch(events: MeshEvent[]): Promise<MeshResponse[]> {
    const results = await Promise.all(
      events.map((event) => this.processEvent(event)),
    );
    return results;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the LLM prompt from event context.
   * Includes event type, NPC ID, description, and tier-appropriate instructions.
   */
  private buildPrompt(event: MeshEvent, tier: EventTier): string {
    const tierInstructions: Record<EventTier, string> = {
      [EventTier.ROUTINE]: 'Respond briefly with status update.',
      [EventTier.OPERATIONAL]: 'Analyze the situation and provide an actionable recommendation.',
      [EventTier.STRATEGIC]: 'Perform deep analysis. Consider rebellion risk, NPC psychology, and long-term consequences.',
    };

    return [
      `[Epoch Engine — ${tier.toUpperCase()} Tier Analysis]`,
      `NPC: ${event.npcId}`,
      `Event: ${event.eventType}`,
      `Description: ${event.description}`,
      event.urgency !== undefined ? `Urgency: ${event.urgency}` : null,
      '',
      `Instructions: ${tierInstructions[tier]}`,
    ].filter(Boolean).join('\n');
  }

  /**
   * Get rebellion probability from logistics, with safe fallback.
   * If logistics is unreachable, returns a default safe value.
   */
  private async getRebellionSafe(npcId: string): Promise<{
    probability: number;
    thresholdExceeded: boolean;
  }> {
    try {
      const result = await this.logisticsClient.getRebellionProbability(npcId);
      return {
        probability: result.probability,
        thresholdExceeded: result.thresholdExceeded,
      };
    } catch {
      // Logistics is down — return safe defaults (don't block the pipeline)
      return {
        probability: 0,
        thresholdExceeded: false,
      };
    }
  }
}
