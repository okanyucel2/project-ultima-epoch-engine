#!/usr/bin/env -S npx tsx
// =============================================================================
// DOOMSDAY SCENARIO — Pipeline-Integrated (Wave 46A)
//
// Routes ALL events through the Neural Mesh observation pipeline:
//   EventClassifier → TierRouter → LLM → CognitiveRails → AEGIS → Neo4j
//
// Rebellion alerts are computed ORGANICALLY by CognitiveRails.
// No data bypasses the pipeline. Zero-Bypass Protocol enforced.
//
// Usage:
//   npx tsx packages/engine-bridge/scripts/run-doomsday-pipeline.ts
//   npx tsx packages/engine-bridge/scripts/run-doomsday-pipeline.ts --port 12064
//
// Requires orchestration server running on port 12064 (or --port flag).
// =============================================================================

// ---------------------------------------------------------------------------
// ANSI Colors
// ---------------------------------------------------------------------------
const R = '\x1b[31m';
const G = '\x1b[32m';
const Y = '\x1b[33m';
const B = '\x1b[34m';
const M = '\x1b[35m';
const C = '\x1b[36m';
const W = '\x1b[37m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RST = '\x1b[0m';

function bar(value: number, width = 20): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  const color = value > 0.7 ? R : value > 0.4 ? Y : G;
  return `${color}${'█'.repeat(filled)}${DIM}${'░'.repeat(empty)}${RST}`;
}

// ---------------------------------------------------------------------------
// DOOMSDAY TIMELINE (rebellion-alerts REMOVED — computed by CognitiveRails)
// ---------------------------------------------------------------------------

interface TimelinePhase {
  name: string;
  description: string;
  delayMs: number;
  events: Array<{ channel: string; data: Record<string, unknown> }>;
}

const TIMELINE: TimelinePhase[] = [
  // Phase 1: STORM GATHERING
  {
    name: 'STORM GATHERING',
    description: 'Resources depleting, tension rising across all NPCs',
    delayMs: 0,
    events: [
      {
        channel: 'simulation-ticks',
        data: {
          tickNumber: 14500,
          resources: {
            sim: { quantity: 800, productionRate: 8.0, consumptionRate: 15.2 },
            rapidlum: { quantity: 45, productionRate: 1.2, consumptionRate: 3.8 },
            mineral: { quantity: 1200, productionRate: 10, consumptionRate: 22 },
          },
          facilities: { refineries: 2, mines: 3 },
          population: { activeNPCs: 8, overallRebellionProbability: 0.55 },
          infestation: { counter: 42, isPlagueHeart: false, throttleMultiplier: 0.85 },
        },
      },
      {
        channel: 'npc-events',
        data: {
          npcId: 'npc-bones-001', name: 'Captain Bones',
          wisdomScore: 0.82, traumaScore: 0.55, rebellionProbability: 0.62,
          confidenceInDirector: 0.28, workEfficiency: 0.6, morale: 0.35,
          memoryCount: 412, status: 'active',
        },
      },
      {
        channel: 'npc-events',
        data: {
          npcId: 'npc-vex-002', name: 'Vex',
          wisdomScore: 0.71, traumaScore: 0.60, rebellionProbability: 0.58,
          confidenceInDirector: 0.32, workEfficiency: 0.55, morale: 0.40,
          memoryCount: 289, status: 'active',
        },
      },
      {
        channel: 'npc-events',
        data: {
          npcId: 'npc-iron-004', name: 'Iron',
          wisdomScore: 0.45, traumaScore: 0.48, rebellionProbability: 0.35,
          confidenceInDirector: 0.40, workEfficiency: 0.50, morale: 0.30,
          memoryCount: 156, status: 'active',
        },
      },
    ],
  },

  // Phase 2: ORK SIEGE — Captain Bones erupts (rebellion 0.92 → VETO by CognitiveRails)
  {
    name: 'BÜYÜK ORK KUŞATMASI',
    description: 'Captain Bones erupts into full rebellion — CognitiveRails will compute veto',
    delayMs: 1500,
    events: [
      {
        channel: 'simulation-ticks',
        data: {
          tickNumber: 14520,
          resources: {
            sim: { quantity: 320, productionRate: 3.0, consumptionRate: 18.5 },
            rapidlum: { quantity: 12, productionRate: 0.3, consumptionRate: 4.2 },
            mineral: { quantity: 400, productionRate: 2, consumptionRate: 25 },
          },
          facilities: { refineries: 1, mines: 2 },
          population: { activeNPCs: 8, overallRebellionProbability: 0.78 },
          infestation: { counter: 65, isPlagueHeart: false, throttleMultiplier: 0.60 },
        },
      },
      {
        channel: 'npc-events',
        data: {
          npcId: 'npc-bones-001', name: 'Captain Bones',
          wisdomScore: 0.82, traumaScore: 0.78, rebellionProbability: 0.92,
          confidenceInDirector: 0.08, workEfficiency: 0.25, morale: 0.12,
          memoryCount: 418, status: 'rebelling',
        },
      },
      // NO rebellion-alerts — CognitiveRails will compute the veto organically
    ],
  },

  // Phase 3: PRISM ANOMALY — Vex at plague heart threshold (AEGIS intervention)
  {
    name: 'PRİZMA ANOMALİSİ',
    description: 'Vex approaches veto threshold — AEGIS fires organic containment',
    delayMs: 1500,
    events: [
      {
        channel: 'simulation-ticks',
        data: {
          tickNumber: 14540,
          resources: {
            sim: { quantity: 85, productionRate: 1.0, consumptionRate: 20.0 },
            rapidlum: { quantity: 2, productionRate: 0.1, consumptionRate: 5.0 },
            mineral: { quantity: 90, productionRate: 0.5, consumptionRate: 28 },
          },
          facilities: { refineries: 0, mines: 1 },
          population: { activeNPCs: 8, overallRebellionProbability: 0.88 },
          infestation: { counter: 85, isPlagueHeart: true, throttleMultiplier: 0.35 },
        },
      },
      {
        channel: 'npc-events',
        data: {
          npcId: 'npc-vex-002', name: 'Vex',
          wisdomScore: 0.71, traumaScore: 0.88, rebellionProbability: 0.85,
          confidenceInDirector: 0.05, workEfficiency: 0.20, morale: 0.10,
          memoryCount: 301, status: 'active',
        },
      },
      // NO rebellion-alerts — CognitiveRails rebellion threshold will fire organically
      {
        channel: 'npc-events',
        data: {
          npcId: 'npc-iron-004', name: 'Iron',
          wisdomScore: 0.45, traumaScore: 0.72, rebellionProbability: 0.48,
          confidenceInDirector: 0.12, workEfficiency: 0.15, morale: 0.08,
          memoryCount: 162, status: 'active',
        },
      },
    ],
  },

  // Phase 4: TOTAL BREAKDOWN — All 3 NPCs suffer mental breakdowns
  {
    name: 'TOTAL BREAKDOWN',
    description: 'All 3 NPCs suffer simultaneous mental breakdowns',
    delayMs: 2000,
    events: [
      {
        channel: 'telemetry',
        data: {
          eventId: 'tel-doom-001', npcId: 'npc-bones-001', severity: 'catastrophic',
          type: 'mental_breakdown',
          mentalBreakdown: {
            breakdownType: 'rage_episode', intensity: 0.95,
            stressBefore: 0.78, stressAfter: 0.99,
            triggerContext: 'ork-siege-final-wave', resolved: false, recoveryProbability: 0.10,
          },
        },
      },
      {
        channel: 'telemetry',
        data: {
          eventId: 'tel-doom-002', npcId: 'npc-vex-002', severity: 'catastrophic',
          type: 'mental_breakdown',
          mentalBreakdown: {
            breakdownType: 'paranoia_onset', intensity: 0.85,
            stressBefore: 0.82, stressAfter: 0.96,
            triggerContext: 'prism-anomaly-hallucination', resolved: false, recoveryProbability: 0.25,
          },
        },
      },
      {
        channel: 'telemetry',
        data: {
          eventId: 'tel-doom-003', npcId: 'npc-iron-004', severity: 'catastrophic',
          type: 'mental_breakdown',
          mentalBreakdown: {
            breakdownType: 'dissociation', intensity: 0.90,
            stressBefore: 0.72, stressAfter: 0.98,
            triggerContext: 'starvation-third-day', resolved: false, recoveryProbability: 0.15,
          },
        },
      },
    ],
  },

  // Phase 5: AFTERMATH — Permanent scars
  {
    name: 'AFTERMATH',
    description: 'Permanent trauma inflicted — scars that never heal',
    delayMs: 1500,
    events: [
      {
        channel: 'npc-events',
        data: {
          npcId: 'npc-bones-001', name: 'Captain Bones',
          wisdomScore: 0.82, traumaScore: 0.96, rebellionProbability: 0.95,
          confidenceInDirector: 0.02, workEfficiency: 0.10, morale: 0.05,
          memoryCount: 425, status: 'rebelling',
        },
      },
      {
        channel: 'npc-events',
        data: {
          npcId: 'npc-vex-002', name: 'Vex',
          wisdomScore: 0.71, traumaScore: 0.94, rebellionProbability: 0.82,
          confidenceInDirector: 0.03, workEfficiency: 0.10, morale: 0.05,
          memoryCount: 308, status: 'active',
        },
      },
      {
        channel: 'npc-events',
        data: {
          npcId: 'npc-iron-004', name: 'Iron',
          wisdomScore: 0.45, traumaScore: 0.92, rebellionProbability: 0.55,
          confidenceInDirector: 0.05, workEfficiency: 0.05, morale: 0.02,
          memoryCount: 165, status: 'idle',
        },
      },
      {
        channel: 'telemetry',
        data: {
          eventId: 'tel-doom-004', npcId: 'npc-iron-004', severity: 'catastrophic',
          type: 'permanent_trauma',
          permanentTrauma: {
            traumaType: 'morale_collapse', severity: 0.92,
            affectedAttribute: 'morale', attributeReduction: 0.45,
            triggerContext: 'starvation-prolonged', phobiaTarget: 'food_storage',
          },
        },
      },
      {
        channel: 'simulation-ticks',
        data: {
          tickNumber: 14580,
          resources: {
            sim: { quantity: 5, productionRate: 0.1, consumptionRate: 22.0 },
            rapidlum: { quantity: 0, productionRate: 0, consumptionRate: 6.0 },
            mineral: { quantity: 12, productionRate: 0, consumptionRate: 30 },
          },
          facilities: { refineries: 0, mines: 0 },
          population: { activeNPCs: 3, overallRebellionProbability: 0.95 },
          infestation: { counter: 97, isPlagueHeart: true, throttleMultiplier: 0.10 },
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// EXECUTION — Hits the orchestration API
// ---------------------------------------------------------------------------

async function runPipeline(): Promise<void> {
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : 12064;
  const baseUrl = `http://localhost:${port}`;

  console.log(`\n${BOLD}${R}╔══════════════════════════════════════════════════════════════╗${RST}`);
  console.log(`${BOLD}${R}║     EPOCH ENGINE — DOOMSDAY SCENARIO (Wave 46A — Pipeline)   ║${RST}`);
  console.log(`${BOLD}${R}║            Zero-Bypass Protocol Enforced                      ║${RST}`);
  console.log(`${BOLD}${R}╚══════════════════════════════════════════════════════════════╝${RST}\n`);

  console.log(`${DIM}Mode: PIPELINE (all events through Neural Mesh)${RST}`);
  console.log(`${DIM}Target: ${baseUrl}${RST}`);
  console.log(`${DIM}Channels: simulation-ticks, npc-events, telemetry (NO rebellion-alerts)${RST}\n`);

  // Health check first
  try {
    const health = await fetch(`${baseUrl}/health`);
    if (!health.ok) throw new Error(`Health check failed: ${health.status}`);
    const data = await health.json() as { version: string };
    console.log(`${G}✓ Orchestration alive — v${data.version}${RST}\n`);
  } catch (err) {
    console.error(`${R}✗ Orchestration unreachable at ${baseUrl}${RST}`);
    console.error(`${DIM}  Start with: cd orchestration && npm run dev${RST}`);
    process.exit(1);
  }

  // Trigger doomsday through the pipeline
  console.log(`${Y}Triggering doomsday through Neural Mesh pipeline...${RST}\n`);

  const startTime = Date.now();
  const response = await fetch(`${baseUrl}/api/doomsday/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeline: TIMELINE }),
  });

  if (!response.ok) {
    const err = await response.json() as { error: string };
    console.error(`${R}Doomsday failed: ${err.error}${RST}`);
    process.exit(1);
  }

  const result = await response.json() as {
    status: string;
    phases: Array<{
      phase: string;
      description: string;
      eventResults: Array<{
        channel: string;
        npcId?: string;
        action: string;
        vetoApplied?: boolean;
        vetoReason?: string;
        persisted: boolean;
      }>;
      infestationLevel: number;
      vetoes: number;
      pipelineEvents: number;
      persistedEvents: number;
      durationMs: number;
    }>;
    summary: {
      totalEvents: number;
      pipelineEvents: number;
      vetoes: number;
      persistedEvents: number;
      rejectedInputs: number;
      peakInfestationLevel: number;
      totalDurationMs: number;
    };
  };
  const elapsed = Date.now() - startTime;

  // Display results per phase
  for (const phase of result.phases) {
    console.log(`${BOLD}${Y}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}`);
    console.log(`${BOLD}${Y}  PHASE: ${phase.phase}${RST}`);
    console.log(`${DIM}  ${phase.description}${RST}`);
    console.log(`${DIM}  Infestation: ${bar(phase.infestationLevel / 100)} ${phase.infestationLevel}/100${RST}`);
    console.log(`${Y}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}\n`);

    for (const evt of phase.eventResults) {
      const icon = evt.action === 'pipeline' ? (evt.vetoApplied ? `${R}⛔` : `${G}✓`) :
                   evt.action === 'infestation_update' ? `${C}📊` :
                   evt.action === 'telemetry_persist' ? `${M}🧠` :
                   `${R}🚫`;
      const npc = evt.npcId ? ` ${BOLD}${evt.npcId}${RST}` : '';
      const veto = evt.vetoApplied ? ` ${R}VETO: ${evt.vetoReason}${RST}` : '';
      const persist = evt.persisted ? ` ${DIM}[Neo4j ✓]${RST}` : '';
      console.log(`  ${icon}${RST} ${evt.channel}${npc}${veto}${persist}`);
    }

    if (phase.vetoes > 0) {
      console.log(`\n  ${R}${BOLD}${phase.vetoes} ORGANIC VETO(S) by CognitiveRails${RST}`);
    }
    console.log('');
  }

  // Summary
  const s = result.summary;
  console.log(`${BOLD}${W}╔══════════════════════════════════════════════════════════════╗${RST}`);
  console.log(`${BOLD}${W}║                 DOOMSDAY PIPELINE SUMMARY                    ║${RST}`);
  console.log(`${BOLD}${W}╠══════════════════════════════════════════════════════════════╣${RST}`);
  console.log(`${W}║  Total events:         ${BOLD}${s.totalEvents}${RST}${W}                                  ║${RST}`);
  console.log(`${W}║  Pipeline (NPC):       ${BOLD}${s.pipelineEvents}${RST}${W}                                  ║${RST}`);
  console.log(`${W}║  Organic vetoes:       ${R}${BOLD}${s.vetoes}${RST}${W}                                   ║${RST}`);
  console.log(`${W}║  Persisted (Neo4j):    ${G}${BOLD}${s.persistedEvents}${RST}${W}                                  ║${RST}`);
  console.log(`${W}║  Rejected inputs:      ${Y}${BOLD}${s.rejectedInputs}${RST}${W}                                   ║${RST}`);
  console.log(`${W}║  Peak infestation:     ${bar(s.peakInfestationLevel / 100)} ${s.peakInfestationLevel}/100   ║${RST}`);
  console.log(`${W}║  Pipeline duration:    ${BOLD}${s.totalDurationMs}ms${RST}${W}                               ║${RST}`);
  console.log(`${W}║  Total (with delays):  ${BOLD}${elapsed}ms${RST}${W}                              ║${RST}`);
  console.log(`${BOLD}${W}╚══════════════════════════════════════════════════════════════╝${RST}\n`);

  console.log(`${BOLD}${G}Zero-Bypass Protocol: ALL events routed through Neural Mesh.${RST}`);
  console.log(`${BOLD}${G}No data bypassed EventClassifier, TierRouter, CognitiveRails, or AEGIS.${RST}\n`);
}

runPipeline().catch(console.error);
