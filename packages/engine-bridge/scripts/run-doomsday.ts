#!/usr/bin/env -S npx tsx
// =============================================================================
// DOOMSDAY SCENARIO — Wave 24A: Kıyamet Enjeksiyonu
//
// Injects 3 simultaneous crises into the Epoch Engine pipeline:
//   1. Büyük Ork Kuşatması (Great Orc Siege) → Captain Bones → rage_episode
//   2. Prizma Anomalisi (Prism Anomaly)       → Vex           → paranoia_onset
//   3. Yetersiz Erzak (Starvation)            → Iron          → dissociation
//
// Usage:
//   npx tsx packages/engine-bridge/scripts/run-doomsday.ts
// =============================================================================

import { EpochDispatcher } from '../src/dispatcher';
import { GodotExporter, type GodotFrame } from '../src/exporters/godot-exporter';
import { UE5Exporter, type UE5Frame } from '../src/exporters/ue5-exporter';

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

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------
function bar(value: number, width = 20): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  const color = value > 0.7 ? R : value > 0.4 ? Y : G;
  return `${color}${'█'.repeat(filled)}${DIM}${'░'.repeat(empty)}${RST}`;
}

function pad(s: string, len: number): string {
  return s.padEnd(len);
}

const startTime = Date.now();
function elapsed(): string {
  const ms = Date.now() - startTime;
  const s = Math.floor(ms / 1000);
  const frac = String(ms % 1000).padStart(3, '0');
  return `${DIM}[T+${s}.${frac}s]${RST}`;
}

// ---------------------------------------------------------------------------
// Frame loggers
// ---------------------------------------------------------------------------
function logGodotFrame(frame: GodotFrame): void {
  for (const sig of frame.signals) {
    console.log(`${elapsed()} ${C}⚡ GODOT SIGNAL${RST}: ${BOLD}${sig.signal}${RST}`);
    for (const [k, v] of Object.entries(sig.args)) {
      console.log(`${DIM}         ${pad(k, 24)}${RST}${W}${v}${RST}`);
    }
  }

  for (const [npcId, params] of Object.entries(frame.animationParams)) {
    console.log(`${elapsed()} ${C}🎭 GODOT AnimTree${RST}: ${npcId}`);
    console.log(`${DIM}         state:${RST}  ${BOLD}${params.stateMachineState}${RST}`);
    console.log(`${DIM}         blend:${RST}  [${params.blendPosition[0].toFixed(3)}, ${params.blendPosition[1].toFixed(3)}]`);
    console.log(`${DIM}         speed:${RST}  ${params.speedScale}`);
    console.log(`${DIM}         rebel:${RST}  ${bar(params.rebellionIntensity)} ${params.rebellionIntensity.toFixed(3)}`);
  }

  for (const upd of frame.nodeUpdates) {
    if (Object.keys(upd.properties).length <= 2) continue;
    console.log(`${elapsed()} ${C}📦 GODOT Node${RST}: ${DIM}${upd.nodePath}${RST}`);
  }
}

function logUE5Frame(frame: UE5Frame): void {
  for (const s of frame.structs) {
    console.log(`${elapsed()} ${M}🔷 UE5 USTRUCT${RST}: FEpochNPCState`);
    console.log(`${DIM}         NPCId:${RST}    ${s.NPCId}`);
    console.log(`${DIM}         Status:${RST}   ${BOLD}${s.Status}${RST}`);
    console.log(`${DIM}         Rebel:${RST}    ${bar(s.RebellionProbability)} ${s.RebellionProbability}`);
    console.log(`${DIM}         Trauma:${RST}   ${bar(s.TraumaScore)} ${s.TraumaScore}`);
    console.log(`${DIM}         Morale:${RST}   ${bar(s.Morale)} ${s.Morale}`);
  }

  for (const bb of frame.blackboards) {
    console.log(`${elapsed()} ${M}🧠 UE5 Blackboard${RST}: ${bb.NPCId}`);
    const keys = bb.keys;
    console.log(`${DIM}         IsRebelling:${RST}       ${keys.IsRebelling ? `${R}TRUE${RST}` : `${G}false${RST}`}`);
    console.log(`${DIM}         PreferredBehavior:${RST} ${BOLD}${keys.PreferredBehavior}${RST}`);
    if (typeof keys.MovementSpeed === 'number') {
      console.log(`${DIM}         MovementSpeed:${RST}     ${keys.MovementSpeed}`);
    }
    if (typeof keys.AggressionLevel === 'number') {
      console.log(`${DIM}         AggressionLevel:${RST}   ${bar(keys.AggressionLevel as number)} ${(keys.AggressionLevel as number).toFixed(3)}`);
    }
  }

  for (const face of frame.faceStates) {
    console.log(`${elapsed()} ${M}👤 UE5 MetaHuman Face${RST}: ${BOLD}${face.npcId}${RST}`);
    console.log(`${DIM}         ─── ARKit Morph Targets ───${RST}`);
    const morphOrder = [
      'browDownLeft', 'browDownRight', 'browInnerUp',
      'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
      'mouthFrownLeft', 'mouthFrownRight', 'mouthSmileLeft', 'mouthSmileRight',
      'jawOpen', 'noseSneerLeft', 'noseSneerRight',
    ];
    for (const key of morphOrder) {
      const val = face.morphTargets[key];
      if (val === undefined) continue;
      if (val < 0.001) continue;
      console.log(`${DIM}         ${pad(key, 20)}${RST} ${bar(val)} ${val.toFixed(3)}`);
    }
    console.log(`${DIM}         ─── Emotion Curves ───${RST}`);
    for (const [emotion, val] of Object.entries(face.emotionCurves)) {
      if (val < 0.001) continue;
      const color = emotion === 'Anger' ? R : emotion === 'Fear' ? Y : emotion === 'Sadness' ? B : W;
      console.log(`${DIM}         ${pad(emotion, 20)}${RST} ${color}${bar(val)}${RST} ${val.toFixed(3)}`);
    }
  }

  for (const vfx of frame.vfxTriggers) {
    const actionColor = vfx.action === 'activate' ? R : vfx.action === 'burst' ? Y : G;
    console.log(`${elapsed()} ${M}✨ UE5 Niagara VFX${RST}: ${BOLD}${vfx.systemName}${RST} → ${actionColor}${vfx.action.toUpperCase()}${RST}`);
    for (const [k, v] of Object.entries(vfx.parameters)) {
      console.log(`${DIM}         ${pad(k, 20)}${RST}${v}`);
    }
  }

  for (const mat of frame.materialParams) {
    console.log(`${elapsed()} ${M}🎨 UE5 Material${RST}: ${DIM}${mat.npcId}${RST} ${mat.parameterName} = ${mat.value}`);
  }
}

// ---------------------------------------------------------------------------
// DOOMSDAY TIMELINE
// ---------------------------------------------------------------------------

interface TimelinePhase {
  name: string;
  description: string;
  delayMs: number;
  events: Array<{ channel: string; data: Record<string, unknown> }>;
}

const TIMELINE: TimelinePhase[] = [
  // =========================================================================
  // PHASE 1: STORM GATHERING
  // =========================================================================
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

  // =========================================================================
  // PHASE 2: ORK SIEGE BEGINS
  // =========================================================================
  {
    name: 'BÜYÜK ORK KUŞATMASI',
    description: 'Captain Bones erupts into full rebellion — rage building',
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
      {
        channel: 'rebellion-alerts',
        data: {
          eventId: 'reb-doom-001', npcId: 'npc-bones-001', npcName: 'Captain Bones',
          probability: 0.92, rebellionType: 'active',
          triggerActionId: 'act-ork-siege-001',
          vetoedByAegis: false, vetoReason: null,
        },
      },
    ],
  },

  // =========================================================================
  // PHASE 3: PRISM ANOMALY — AEGIS INTERVENTION
  // =========================================================================
  {
    name: 'PRİZMA ANOMALİSİ',
    description: 'Vex approaches veto threshold — AEGIS fires containment',
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
      {
        channel: 'rebellion-alerts',
        data: {
          eventId: 'reb-doom-002', npcId: 'npc-vex-002', npcName: 'Vex',
          probability: 0.85, rebellionType: 'active',
          triggerActionId: 'act-prism-anomaly-001',
          vetoedByAegis: true, vetoReason: 'Cognitive Rails: Prism Anomaly destabilization',
        },
      },
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

  // =========================================================================
  // PHASE 4: TOTAL BREAKDOWN — ALL 3 CRACK
  // =========================================================================
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

  // =========================================================================
  // PHASE 5: AFTERMATH — PERMANENT SCARS
  // =========================================================================
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
// EXECUTION
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLocal(): Promise<void> {
  console.log(`\n${BOLD}${R}╔══════════════════════════════════════════════════════════════╗${RST}`);
  console.log(`${BOLD}${R}║          EPOCH ENGINE — DOOMSDAY SCENARIO (Wave 24A)         ║${RST}`);
  console.log(`${BOLD}${R}║                    Kıyamet Enjeksiyonu                       ║${RST}`);
  console.log(`${BOLD}${R}╚══════════════════════════════════════════════════════════════╝${RST}\n`);

  console.log(`${DIM}Mode: LOCAL PIPELINE (dispatcher + both exporters)${RST}`);
  console.log(`${DIM}Crises: Ork Siege × Prism Anomaly × Starvation${RST}`);
  console.log(`${DIM}Victims: Captain Bones (rage) × Vex (paranoia) × Iron (dissociation)${RST}\n`);

  const dispatcher = new EpochDispatcher({
    onError: (err) => console.error(`${R}VALIDATION ERROR:${RST}`, err.channel, err.zodErrors),
  });

  let godotFrameCount = 0;
  let ue5FrameCount = 0;

  const godotExporter = new GodotExporter((frame) => {
    godotFrameCount++;
    logGodotFrame(frame);
  });

  const ue5Exporter = new UE5Exporter((frame) => {
    ue5FrameCount++;
    logUE5Frame(frame);
  });

  godotExporter.attach(dispatcher);
  ue5Exporter.attach(dispatcher);

  for (const phase of TIMELINE) {
    if (phase.delayMs > 0) await sleep(phase.delayMs);

    console.log(`\n${BOLD}${Y}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}`);
    console.log(`${BOLD}${Y}  PHASE: ${phase.name}${RST}`);
    console.log(`${DIM}  ${phase.description}${RST}`);
    console.log(`${BOLD}${Y}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}\n`);

    for (const event of phase.events) {
      const envelope = JSON.stringify({
        channel: event.channel,
        data: event.data,
        timestamp: new Date().toISOString(),
      });
      dispatcher.processMessage(envelope);
    }
  }

  // Summary
  const stats = dispatcher.stats;
  console.log(`\n${BOLD}${W}╔══════════════════════════════════════════════════════════════╗${RST}`);
  console.log(`${BOLD}${W}║                    DOOMSDAY SUMMARY                          ║${RST}`);
  console.log(`${BOLD}${W}╠══════════════════════════════════════════════════════════════╣${RST}`);
  console.log(`${W}║  Messages received:    ${BOLD}${stats.totalReceived}${RST}${W}                                  ║${RST}`);
  console.log(`${W}║  Messages dispatched:  ${BOLD}${stats.totalDispatched}${RST}${W}                                  ║${RST}`);
  console.log(`${W}║  Validation errors:    ${BOLD}${stats.totalErrors}${RST}${W}                                   ║${RST}`);
  console.log(`${W}║  Godot frames:         ${BOLD}${godotFrameCount}${RST}${W}                                  ║${RST}`);
  console.log(`${W}║  UE5 frames:           ${BOLD}${ue5FrameCount}${RST}${W}                                  ║${RST}`);
  console.log(`${W}║  Handler count:        ${BOLD}${stats.handlerCount}${RST}${W}                                   ║${RST}`);
  console.log(`${BOLD}${W}╠══════════════════════════════════════════════════════════════╣${RST}`);
  console.log(`${W}║  Breakdowns triggered: ${R}${BOLD}3${RST}${W}                                   ║${RST}`);
  console.log(`${W}║    • Captain Bones:    ${R}rage_episode${RST}${W}       (intensity 0.95) ║${RST}`);
  console.log(`${W}║    • Vex:              ${Y}paranoia_onset${RST}${W}     (intensity 0.85) ║${RST}`);
  console.log(`${W}║    • Iron:             ${B}dissociation${RST}${W}       (intensity 0.90) ║${RST}`);
  console.log(`${W}║  AEGIS vetoes:         ${G}${BOLD}1${RST}${W} (Vex — Cognitive Rails)             ║${RST}`);
  console.log(`${W}║  Permanent trauma:     ${R}${BOLD}1${RST}${W} (Iron — morale_collapse)            ║${RST}`);
  console.log(`${BOLD}${W}╚══════════════════════════════════════════════════════════════╝${RST}\n`);
}

runLocal().catch(console.error);
