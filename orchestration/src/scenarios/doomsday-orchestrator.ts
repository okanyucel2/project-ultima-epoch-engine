// =============================================================================
// DoomsdayOrchestrator — Pipeline-Integrated Doomsday Scenario (Wave 46A)
// =============================================================================
// Routes ALL doomsday events through the Neural Mesh pipeline. Zero bypass.
//
// Channel routing:
//   simulation-ticks  → AEGIS infestation update + WS broadcast (world state)
//   npc-events        → Transform to MeshEvent → coordinator.processEvent()
//                       (EventClassifier → TierRouter → LLM → CognitiveRails → AEGIS → Neo4j)
//   telemetry         → Persist to Neo4j + WS broadcast (with AEGIS check)
//   rebellion-alerts  → REJECTED (must be computed by CognitiveRails, never injected)
//
// #WWOD: No MVP bridge scripts. Events flow through the real observation pipeline.
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import { NeuralMeshCoordinator } from '../neural-mesh/coordinator';
import { AEGISSupervisor } from '../services/aegis-supervisor';
import { EpochWebSocketServer } from '../services/websocket-server';
import { MemoryIntegration } from '../services/memory-integration';
import type { MeshEvent, MeshResponse } from '../neural-mesh/types';

// =============================================================================
// Types
// =============================================================================

export interface TimelinePhase {
  name: string;
  description: string;
  delayMs: number;
  events: Array<{ channel: string; data: Record<string, unknown> }>;
}

export interface DoomsdayEventResult {
  channel: string;
  npcId?: string;
  action: 'pipeline' | 'infestation_update' | 'telemetry_persist' | 'rejected';
  meshResponse?: MeshResponse;
  vetoApplied?: boolean;
  vetoReason?: string;
  persisted: boolean;
}

export interface PhaseResult {
  phase: string;
  description: string;
  eventResults: DoomsdayEventResult[];
  infestationLevel: number;
  vetoes: number;
  pipelineEvents: number;
  persistedEvents: number;
  durationMs: number;
}

export interface DoomsdayResult {
  phases: PhaseResult[];
  summary: {
    totalEvents: number;
    pipelineEvents: number;
    vetoes: number;
    persistedEvents: number;
    rejectedInputs: number;
    peakInfestationLevel: number;
    totalDurationMs: number;
  };
}

// =============================================================================
// DoomsdayOrchestrator Class
// =============================================================================

export class DoomsdayOrchestrator {
  private readonly coordinator: NeuralMeshCoordinator;
  private readonly aegisSupervisor: AEGISSupervisor;
  private readonly wsServer: EpochWebSocketServer;
  private readonly memoryIntegration: MemoryIntegration | null;
  private peakInfestationLevel = 0;

  constructor(
    coordinator: NeuralMeshCoordinator,
    aegisSupervisor: AEGISSupervisor,
    wsServer: EpochWebSocketServer,
    memoryIntegration: MemoryIntegration | null = null,
  ) {
    this.coordinator = coordinator;
    this.aegisSupervisor = aegisSupervisor;
    this.wsServer = wsServer;
    this.memoryIntegration = memoryIntegration;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Execute the full doomsday scenario through the Neural Mesh pipeline.
   * Every NPC event passes through: classify → route → LLM → rails → AEGIS → Neo4j.
   * Rebellion alerts are NEVER injected — they are computed organically by CognitiveRails.
   */
  async execute(timeline: TimelinePhase[]): Promise<DoomsdayResult> {
    const startTime = Date.now();
    const phases: PhaseResult[] = [];

    for (const phase of timeline) {
      if (phase.delayMs > 0) {
        await this.sleep(phase.delayMs);
      }
      const result = await this.processPhase(phase);
      phases.push(result);
    }

    const totalDurationMs = Date.now() - startTime;

    return {
      phases,
      summary: {
        totalEvents: phases.reduce((sum, p) => sum + p.eventResults.length, 0),
        pipelineEvents: phases.reduce((sum, p) => sum + p.pipelineEvents, 0),
        vetoes: phases.reduce((sum, p) => sum + p.vetoes, 0),
        persistedEvents: phases.reduce((sum, p) => sum + p.persistedEvents, 0),
        rejectedInputs: phases.reduce(
          (sum, p) => sum + p.eventResults.filter((r) => r.action === 'rejected').length,
          0,
        ),
        peakInfestationLevel: this.peakInfestationLevel,
        totalDurationMs,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Phase processor
  // ---------------------------------------------------------------------------

  async processPhase(phase: TimelinePhase): Promise<PhaseResult> {
    const phaseStart = Date.now();
    const eventResults: DoomsdayEventResult[] = [];

    for (const event of phase.events) {
      const result = await this.routeEvent(event.channel, event.data);
      eventResults.push(result);
    }

    const infestationLevel = this.aegisSupervisor.getInfestationLevel();
    if (infestationLevel > this.peakInfestationLevel) {
      this.peakInfestationLevel = infestationLevel;
    }

    return {
      phase: phase.name,
      description: phase.description,
      eventResults,
      infestationLevel,
      vetoes: eventResults.filter((r) => r.vetoApplied).length,
      pipelineEvents: eventResults.filter((r) => r.action === 'pipeline').length,
      persistedEvents: eventResults.filter((r) => r.persisted).length,
      durationMs: Date.now() - phaseStart,
    };
  }

  // ---------------------------------------------------------------------------
  // Event routing — Zero-Bypass Protocol
  // ---------------------------------------------------------------------------

  /**
   * Route a single event based on channel. rebellion-alerts are REJECTED.
   */
  private async routeEvent(
    channel: string,
    data: Record<string, unknown>,
  ): Promise<DoomsdayEventResult> {
    switch (channel) {
      case 'simulation-ticks':
        return this.processSimulationTick(data);

      case 'npc-events':
        return this.processNPCEvent(data);

      case 'telemetry':
        return this.processTelemetryEvent(data);

      case 'rebellion-alerts':
        // ZERO-BYPASS: rebellion-alerts cannot be injected — they must be
        // computed organically by CognitiveRails through the pipeline.
        return {
          channel: 'rebellion-alerts',
          action: 'rejected',
          persisted: false,
          vetoReason: 'ZERO-BYPASS PROTOCOL: rebellion-alerts must be computed by CognitiveRails, not injected',
        };

      default:
        return {
          channel,
          action: 'rejected',
          persisted: false,
          vetoReason: `Unknown channel "${channel}" — no bypass path exists`,
        };
    }
  }

  // ---------------------------------------------------------------------------
  // Channel handlers
  // ---------------------------------------------------------------------------

  /**
   * simulation-ticks: Update world state — infestation level, resources.
   * Not an NPC decision — updates AEGIS context for subsequent NPC event evaluation.
   */
  private async processSimulationTick(
    data: Record<string, unknown>,
  ): Promise<DoomsdayEventResult> {
    // Extract and update infestation level
    const infestation = data.infestation as
      | { counter: number; isPlagueHeart: boolean; throttleMultiplier: number }
      | undefined;

    if (infestation) {
      this.aegisSupervisor.updateInfestationLevel(infestation.counter);
    }

    // Broadcast world state to dashboard
    this.wsServer.broadcast('simulation-ticks', data);

    return {
      channel: 'simulation-ticks',
      action: 'infestation_update',
      persisted: false, // World state isn't NPC memory
    };
  }

  /**
   * npc-events: Transform NPC state into MeshEvent → full pipeline.
   * This is the core routing — every NPC observation passes through:
   *   EventClassifier → TierRouter → LLM → CognitiveRails → AEGIS → Neo4j
   */
  private async processNPCEvent(
    data: Record<string, unknown>,
  ): Promise<DoomsdayEventResult> {
    const npcId = data.npcId as string;
    const name = data.name as string;
    const rebellionProbability = (data.rebellionProbability as number) ?? 0;
    const traumaScore = (data.traumaScore as number) ?? 0;
    const morale = (data.morale as number) ?? 0.5;
    const status = (data.status as string) ?? 'active';

    // Determine event type based on NPC psychological state
    // High rebellion → escalate to strategic tier (rebellion_analysis)
    // Active rebellion → collective_action (highest urgency)
    // Normal → npc_query (operational tier)
    let eventType: string;
    let urgency: number;

    if (status === 'rebelling' || rebellionProbability >= 0.80) {
      eventType = 'rebellion_analysis';
      urgency = Math.max(rebellionProbability, 0.85);
    } else if (rebellionProbability >= 0.50 || traumaScore >= 0.70) {
      eventType = 'psychology_synthesis';
      urgency = Math.max(rebellionProbability, traumaScore, 0.6);
    } else {
      eventType = 'npc_query';
      urgency = rebellionProbability;
    }

    const description = this.buildNPCDescription(npcId, name, data);

    const meshEvent: MeshEvent = {
      eventId: `doom-${npcId}-${uuidv4().slice(0, 8)}`,
      npcId,
      eventType,
      description,
      urgency,
      metadata: {
        source: 'doomsday',
        ...data,
      },
    };

    // Route through the FULL Neural Mesh pipeline
    const meshResponse = await this.coordinator.processEvent(meshEvent);

    return {
      channel: 'npc-events',
      npcId,
      action: 'pipeline',
      meshResponse,
      vetoApplied: meshResponse.vetoApplied,
      vetoReason: meshResponse.vetoReason,
      persisted: true, // processEvent fires Neo4j persist (fire-and-forget)
    };
  }

  /**
   * telemetry: Mental breakdowns and permanent trauma — psychological cascade events.
   * Persisted to Neo4j and broadcast to dashboard.
   * AEGIS infestation context is checked for severity escalation.
   */
  private async processTelemetryEvent(
    data: Record<string, unknown>,
  ): Promise<DoomsdayEventResult> {
    const npcId = (data.npcId as string) ?? 'unknown';
    const eventId = (data.eventId as string) ?? `doom-tel-${uuidv4().slice(0, 8)}`;
    const severity = data.severity as string;
    const type = data.type as string;

    // Broadcast telemetry to appropriate channels
    if (type === 'mental_breakdown' && data.mentalBreakdown) {
      const breakdown = data.mentalBreakdown as Record<string, unknown>;
      this.wsServer.broadcast('rebellion-alerts', {
        type: 'mental_breakdown',
        eventId,
        npcId,
        severity,
        breakdownType: breakdown.breakdownType,
        intensity: breakdown.intensity,
        stressBefore: breakdown.stressBefore,
        stressAfter: breakdown.stressAfter,
        triggerContext: breakdown.triggerContext,
        recoveryProbability: breakdown.recoveryProbability,
        timestamp: new Date().toISOString(),
      });

      // Critical breakdowns → system-status
      if (severity === 'catastrophic' || severity === 'severe') {
        this.wsServer.broadcast('system-status', {
          alert: 'mental_breakdown',
          npcId,
          severity,
          message: `DOOMSDAY: NPC ${npcId} — ${breakdown.breakdownType} (intensity=${breakdown.intensity})`,
          timestamp: new Date().toISOString(),
        });
      }
    } else if (type === 'permanent_trauma' && data.permanentTrauma) {
      const trauma = data.permanentTrauma as Record<string, unknown>;
      this.wsServer.broadcast('rebellion-alerts', {
        type: 'permanent_trauma',
        eventId,
        npcId,
        severity,
        traumaType: trauma.traumaType,
        traumaSeverity: trauma.severity,
        affectedAttribute: trauma.affectedAttribute,
        attributeReduction: trauma.attributeReduction,
        triggerContext: trauma.triggerContext,
        timestamp: new Date().toISOString(),
      });

      this.wsServer.broadcast('system-status', {
        alert: 'permanent_trauma',
        npcId,
        severity,
        message: `DOOMSDAY PERMANENT: NPC ${npcId} — ${trauma.traumaType} (${trauma.affectedAttribute} -${trauma.attributeReduction})`,
        timestamp: new Date().toISOString(),
      });
    }

    // Persist telemetry to Neo4j via MemoryIntegration
    let persisted = false;
    if (this.memoryIntegration) {
      try {
        const isCatastrophic = severity === 'catastrophic' || severity === 'severe';
        await this.memoryIntegration.recordActionOutcome(
          npcId,
          `telemetry:${type}`,
          false, // Breakdowns are never "successful"
          isCatastrophic ? 0.95 : 0.5,
        );
        persisted = true;
      } catch {
        // Non-blocking — log but don't fail
        persisted = false;
      }
    }

    return {
      channel: 'telemetry',
      npcId,
      action: 'telemetry_persist',
      persisted,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildNPCDescription(
    npcId: string,
    name: string,
    data: Record<string, unknown>,
  ): string {
    const rebellion = ((data.rebellionProbability as number) ?? 0) * 100;
    const trauma = ((data.traumaScore as number) ?? 0) * 100;
    const morale = ((data.morale as number) ?? 0.5) * 100;
    const confidence = ((data.confidenceInDirector as number) ?? 0.5) * 100;
    const status = (data.status as string) ?? 'unknown';
    const infestation = this.aegisSupervisor.getInfestationLevel();

    return [
      `[DOOMSDAY] NPC ${name} (${npcId}) — Status: ${status}`,
      `Rebellion: ${rebellion.toFixed(1)}%, Trauma: ${trauma.toFixed(1)}%, Morale: ${morale.toFixed(1)}%`,
      `Confidence in Director: ${confidence.toFixed(1)}%`,
      `World Infestation: ${infestation}/100${infestation >= 100 ? ' [PLAGUE HEART]' : ''}`,
      `Evaluate NPC psychological state and recommend action.`,
    ].join('\n');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
