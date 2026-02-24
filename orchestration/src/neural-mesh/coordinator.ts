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
//   8. Memory → persist to Neo4j (fire-and-forget)
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
import { EventTier } from '@epoch/shared/ai-router';
import { createTimestamp } from '@epoch/shared/common';
import { EventClassifier } from '../services/event-classifier';
import type { GameEvent } from '../services/event-classifier';
import { TierRouter } from '../services/tier-router';
import { ResilientLLMClient } from '../services/resilient-client';
import type { ILogisticsClient } from '../services/logistics-client';
import { LogisticsGrpcClient } from '../services/logistics-grpc-client';
import type { TelemetryEventHandler } from '../services/logistics-grpc-client';
import { AuditLogger } from '../services/audit-logger';
import { EpochWebSocketServer } from '../services/websocket-server';
import { MemoryIntegration } from '../services/memory-integration';
import { CognitiveRails } from './cognitive-rails';
import { AEGISSupervisor } from '../services/aegis-supervisor';
import type { MeshEvent, MeshResponse, VetoDecision } from './types';
import type { TelemetryEvent } from '../generated/telemetry';

// =============================================================================
// NeuralMeshCoordinator Class
// =============================================================================

export class NeuralMeshCoordinator {
  private readonly classifier: EventClassifier;
  private readonly router: TierRouter;
  private readonly llmClient: ResilientLLMClient;
  private readonly logisticsClient: ILogisticsClient;
  private readonly cognitiveRails: CognitiveRails;
  private readonly aegisSupervisor: AEGISSupervisor;
  private readonly auditLogger: AuditLogger;
  private readonly wsServer: EpochWebSocketServer;
  private readonly memoryIntegration: MemoryIntegration | null;
  private telemetryCancelFn: (() => void) | null = null;

  constructor(
    classifier: EventClassifier,
    router: TierRouter,
    llmClient: ResilientLLMClient,
    logisticsClient: ILogisticsClient,
    cognitiveRails: CognitiveRails,
    auditLogger: AuditLogger,
    wsServer: EpochWebSocketServer,
    memoryIntegration?: MemoryIntegration | null,
    aegisSupervisor?: AEGISSupervisor,
  ) {
    this.classifier = classifier;
    this.router = router;
    this.llmClient = llmClient;
    this.logisticsClient = logisticsClient;
    this.cognitiveRails = cognitiveRails;
    this.aegisSupervisor = aegisSupervisor ?? new AEGISSupervisor();
    this.auditLogger = auditLogger;
    this.wsServer = wsServer;
    this.memoryIntegration = memoryIntegration ?? null;
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

    // Step 5: Run cognitive rails (with AEGIS infestation context)
    const processingTimeMs = Date.now() - startTime;
    const infestationLevel = this.aegisSupervisor.getInfestationLevel();
    const railResult = this.cognitiveRails.evaluateAll({
      rebellionProbability: rebellionCheck.probability,
      aiResponse: llmResponse.content,
      latencyMs: processingTimeMs,
      infestationLevel,
      eventType: event.eventType,
      intensity: event.urgency,
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
    const isAegisVeto = railResult.ruleViolated === 'aegis_infestation' && !railResult.allowed;
    if (response.vetoApplied) {
      this.wsServer.broadcast('cognitive-rails', {
        ...response,
        vetoedByAegis: isAegisVeto,
        infestationLevel,
      });

      // Record veto decision for audit trail
      const veto: VetoDecision = {
        eventId: event.eventId,
        npcId: event.npcId,
        reason: response.vetoReason || 'Unknown veto reason',
        rebellionProbability: rebellionCheck.probability,
        timestamp: createTimestamp(),
        vetoedByAegis: isAegisVeto,
        infestationLevel,
      };
      this.wsServer.broadcast('rebellion-alerts', veto);
    } else {
      // If AEGIS whisper (allowed but warning), broadcast advisory
      if (railResult.ruleViolated === 'aegis_infestation' && railResult.vetoReason) {
        this.wsServer.broadcast('system-status', {
          type: 'aegis_whisper',
          message: railResult.vetoReason,
          infestationLevel,
          npcId: event.npcId,
        });
      }
      this.wsServer.broadcast('npc-events', response);
    }

    // Step 8: Persist to Neo4j memory (fire-and-forget, don't block pipeline)
    if (this.memoryIntegration) {
      const isVeto = response.vetoApplied;
      this.memoryIntegration.recordActionOutcome(
        event.npcId,
        event.eventType,
        !isVeto,
        rebellionCheck.probability,
      ).catch((err) => {
        console.warn('[NeuralMeshCoordinator] Memory persist failed (non-blocking):', err);
      });
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

  /**
   * Subscribe to 0ms telemetry stream from the Go logistics backend.
   * Telemetry events are:
   *   - Broadcast to WebSocket channels for dashboard (karmic feedback)
   *   - Persisted to Neo4j memory graph (fire-and-forget)
   *
   * Only works when the logistics client is a gRPC client (not HTTP fallback).
   */
  startTelemetryStream(): void {
    if (!(this.logisticsClient instanceof LogisticsGrpcClient)) {
      console.warn('[NeuralMeshCoordinator] Telemetry stream requires gRPC client — skipping');
      return;
    }

    if (this.telemetryCancelFn) {
      console.warn('[NeuralMeshCoordinator] Telemetry stream already active');
      return;
    }

    const grpcClient = this.logisticsClient as LogisticsGrpcClient;

    this.telemetryCancelFn = grpcClient.subscribeTelemetry(
      {
        includeMentalBreakdowns: true,
        includePermanentTraumas: true,
        includeStateChanges: true,
      },
      (event: TelemetryEvent) => this.handleTelemetryEvent(event),
      (error: Error) => {
        console.warn('[NeuralMeshCoordinator] Telemetry stream error:', error.message);
        this.telemetryCancelFn = null;
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.startTelemetryStream(), 5000);
      },
    );

    console.log('[NeuralMeshCoordinator] Telemetry stream connected — 0ms event delivery active');
  }

  /**
   * Stop the telemetry stream subscription.
   */
  stopTelemetryStream(): void {
    if (this.telemetryCancelFn) {
      this.telemetryCancelFn();
      this.telemetryCancelFn = null;
      console.log('[NeuralMeshCoordinator] Telemetry stream disconnected');
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Handle a telemetry event from the gRPC stream.
   * Routes to appropriate WebSocket channel and persists to memory.
   */
  private handleTelemetryEvent(event: TelemetryEvent): void {
    const severity = event.severity ?? 0;
    const npcId = event.npcId ?? 'unknown';

    // Determine WebSocket channel and payload based on event type
    if (event.mentalBreakdown) {
      // The Alters-style mental breakdown → rebellion-alerts channel
      const breakdown = event.mentalBreakdown;
      this.wsServer.broadcast('rebellion-alerts', {
        type: 'mental_breakdown',
        eventId: event.eventId,
        npcId,
        severity,
        breakdownType: breakdown.type,
        intensity: breakdown.intensity,
        stressBefore: breakdown.stressBefore,
        stressAfter: breakdown.stressAfter,
        triggerContext: breakdown.triggerContext,
        recoveryProbability: breakdown.recoveryProbability,
        timestamp: event.timestamp?.iso8601,
      });

      // Also broadcast to system-status for dashboard overlay
      if (severity >= 3) { // CRITICAL or CATASTROPHIC
        this.wsServer.broadcast('system-status', {
          alert: 'mental_breakdown',
          npcId,
          severity,
          message: `NPC ${npcId}: ${this.breakdownTypeLabel(breakdown.type)} (intensity=${breakdown.intensity?.toFixed(2)})`,
          timestamp: event.timestamp?.iso8601,
        });
      }
    } else if (event.permanentTrauma) {
      // Battle Brothers-style permanent trauma → rebellion-alerts channel
      const trauma = event.permanentTrauma;
      this.wsServer.broadcast('rebellion-alerts', {
        type: 'permanent_trauma',
        eventId: event.eventId,
        npcId,
        severity,
        traumaType: trauma.type,
        traumaSeverity: trauma.severity,
        affectedAttribute: trauma.affectedAttribute,
        attributeReduction: trauma.attributeReduction,
        triggerContext: trauma.triggerContext,
        timestamp: event.timestamp?.iso8601,
      });

      // Permanent traumas always broadcast to system-status
      this.wsServer.broadcast('system-status', {
        alert: 'permanent_trauma',
        npcId,
        severity,
        message: `PERMANENT: NPC ${npcId} — ${this.traumaTypeLabel(trauma.type)} (${trauma.affectedAttribute} -${trauma.attributeReduction?.toFixed(2)})`,
        timestamp: event.timestamp?.iso8601,
      });
    } else if (event.stateChange) {
      // General state change → npc-events channel
      const change = event.stateChange;
      this.wsServer.broadcast('npc-events', {
        type: 'state_change',
        eventId: event.eventId,
        npcId,
        attribute: change.attribute,
        oldValue: change.oldValue,
        newValue: change.newValue,
        cause: change.cause,
        timestamp: event.timestamp?.iso8601,
      });

      // Sync infestation level from telemetry to AEGIS supervisor
      if (change.attribute === 'infestation_level') {
        const level = typeof change.newValue === 'number' ? change.newValue : parseFloat(String(change.newValue));
        if (!isNaN(level)) {
          this.aegisSupervisor.updateInfestationLevel(level);
        }
      }
    }

    // Fire-and-forget: persist telemetry event to Neo4j memory
    if (this.memoryIntegration) {
      const isPositive = severity <= 1; // INFO = positive outcome
      this.memoryIntegration.recordActionOutcome(
        npcId,
        `telemetry:${event.mentalBreakdown ? 'mental_breakdown' : event.permanentTrauma ? 'permanent_trauma' : 'state_change'}`,
        isPositive,
        0, // Rebellion probability handled separately
      ).catch((err) => {
        console.warn('[NeuralMeshCoordinator] Telemetry memory persist failed (non-blocking):', err);
      });
    }
  }

  private breakdownTypeLabel(type: number | undefined): string {
    const labels: Record<number, string> = {
      1: 'Stress Spike',
      2: 'Psychological Fracture',
      3: 'Identity Crisis',
      4: 'Paranoia Onset',
      5: 'Dissociation',
      6: 'Rage Episode',
    };
    return labels[type ?? 0] ?? 'Unknown Breakdown';
  }

  private traumaTypeLabel(type: number | undefined): string {
    const labels: Record<number, string> = {
      1: 'Limb Loss',
      2: 'Morale Collapse',
      3: 'PTSD',
      4: "Survivor's Guilt",
      5: 'Phobia',
      6: 'Brain Damage',
    };
    return labels[type ?? 0] ?? 'Unknown Trauma';
  }

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
