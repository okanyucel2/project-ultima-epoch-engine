#!/usr/bin/env -S npx tsx
// =============================================================================
// MOCK ENGINE CLIENT — Wave 24B: UE5/Godot Simülatörü
//
// Connects to Epoch Engine WebSocket (:32064) and attaches both exporters.
// Logs every frame to console with ARKit morph values, Godot signals,
// emotion curves, and Niagara VFX triggers — second by second.
//
// Usage:
//   npx tsx packages/engine-bridge/scripts/mock-engine-client.ts
//   npx tsx packages/engine-bridge/scripts/mock-engine-client.ts --port 32064
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
// Helpers
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

function ts(): string {
  return `${DIM}[${new Date().toISOString().substring(11, 23)}]${RST}`;
}

let godotTotal = 0;
let ue5Total = 0;

// ---------------------------------------------------------------------------
// Godot Frame Logger
// ---------------------------------------------------------------------------
function onGodotFrame(frame: GodotFrame): void {
  godotTotal++;
  console.log(`\n${ts()} ${C}${BOLD}═══ GODOT FRAME #${godotTotal} ═══${RST}`);

  for (const sig of frame.signals) {
    console.log(`  ${C}⚡ Signal${RST}: ${BOLD}${sig.signal}${RST}`);
    for (const [key, val] of Object.entries(sig.args)) {
      console.log(`     ${DIM}${pad(key, 26)}${RST}${val}`);
    }
  }

  for (const [npcId, params] of Object.entries(frame.animationParams)) {
    console.log(`  ${C}🎭 AnimTree${RST}: ${npcId}`);
    console.log(`     ${DIM}state:${RST}     ${BOLD}${params.stateMachineState}${RST}`);
    console.log(`     ${DIM}blend:${RST}     [${params.blendPosition[0].toFixed(3)}, ${params.blendPosition[1].toFixed(3)}]`);
    console.log(`     ${DIM}rebellion:${RST} ${bar(params.rebellionIntensity)} ${params.rebellionIntensity.toFixed(3)}`);
    console.log(`     ${DIM}trauma:${RST}    ${bar(params.traumaWeight)} ${params.traumaWeight.toFixed(3)}`);
    console.log(`     ${DIM}speed:${RST}     ${params.speedScale}`);
  }

  for (const upd of frame.nodeUpdates) {
    console.log(`  ${C}📦 Node${RST}: ${DIM}${upd.nodePath}${RST}`);
    for (const [key, val] of Object.entries(upd.properties)) {
      console.log(`     ${DIM}${pad(key, 40)}${RST}${val}`);
    }
  }
}

// ---------------------------------------------------------------------------
// UE5 Frame Logger
// ---------------------------------------------------------------------------
function onUE5Frame(frame: UE5Frame): void {
  ue5Total++;
  console.log(`\n${ts()} ${M}${BOLD}═══ UE5 FRAME #${ue5Total} ═══${RST}`);

  for (const s of frame.structs) {
    console.log(`  ${M}🔷 FEpochNPCState${RST}`);
    console.log(`     ${DIM}NPCId:${RST}     ${s.NPCId}`);
    console.log(`     ${DIM}Name:${RST}      ${s.Name}`);
    console.log(`     ${DIM}Status:${RST}    ${BOLD}${s.Status}${RST}`);
    console.log(`     ${DIM}Rebellion:${RST} ${bar(s.RebellionProbability)} ${s.RebellionProbability}`);
    console.log(`     ${DIM}Trauma:${RST}    ${bar(s.TraumaScore)} ${s.TraumaScore}`);
    console.log(`     ${DIM}Morale:${RST}    ${bar(s.Morale)} ${s.Morale}`);
  }

  for (const bb of frame.blackboards) {
    console.log(`  ${M}🧠 Blackboard${RST}: ${bb.NPCId}`);
    for (const [key, val] of Object.entries(bb.keys)) {
      const display = typeof val === 'boolean'
        ? (val ? `${R}TRUE${RST}` : `${G}false${RST}`)
        : typeof val === 'number'
          ? `${bar(val)} ${val.toFixed(3)}`
          : String(val);
      console.log(`     ${DIM}${pad(key, 26)}${RST}${display}`);
    }
  }

  for (const face of frame.faceStates) {
    console.log(`  ${M}👤 MetaHuman Face${RST}: ${BOLD}${face.npcId}${RST}`);
    console.log(`     ${DIM}── ARKit Morph Targets ──${RST}`);
    const morphOrder = [
      'browDownLeft', 'browDownRight', 'browInnerUp',
      'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
      'mouthFrownLeft', 'mouthFrownRight', 'mouthSmileLeft', 'mouthSmileRight',
      'jawOpen', 'noseSneerLeft', 'noseSneerRight',
    ];
    for (const key of morphOrder) {
      const val = face.morphTargets[key];
      if (val === undefined || val < 0.001) continue;
      console.log(`     ${DIM}${pad(key, 22)}${RST}${bar(val)} ${val.toFixed(3)}`);
    }
    console.log(`     ${DIM}── Emotion Curves ──${RST}`);
    for (const [emotion, val] of Object.entries(face.emotionCurves)) {
      if (val < 0.001) continue;
      const color = emotion === 'Anger' ? R : emotion === 'Fear' ? Y : emotion === 'Sadness' ? B : W;
      console.log(`     ${DIM}${pad(emotion, 22)}${RST}${color}${bar(val)}${RST} ${val.toFixed(3)}`);
    }
  }

  for (const vfx of frame.vfxTriggers) {
    const actionColor = vfx.action === 'activate' ? R : vfx.action === 'burst' ? Y : G;
    console.log(`  ${M}✨ Niagara${RST}: ${BOLD}${vfx.systemName}${RST} → ${actionColor}${vfx.action.toUpperCase()}${RST}`);
    for (const [key, val] of Object.entries(vfx.parameters)) {
      console.log(`     ${DIM}${pad(key, 22)}${RST}${val}`);
    }
  }

  for (const mat of frame.materialParams) {
    console.log(`  ${M}🎨 Material${RST}: ${DIM}${mat.npcId}${RST} ${mat.parameterName} = ${mat.value}`);
  }
}

// ---------------------------------------------------------------------------
// Main — Connect to WebSocket
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const portArg = process.argv.indexOf('--port');
  const port = portArg !== -1 ? parseInt(process.argv[portArg + 1], 10) : 32064;
  const wsUrl = `ws://localhost:${port}`;

  console.log(`${BOLD}${W}╔══════════════════════════════════════════════════════════════╗${RST}`);
  console.log(`${BOLD}${W}║     MOCK ENGINE CLIENT — UE5/Godot Simülatörü (Wave 24B)    ║${RST}`);
  console.log(`${BOLD}${W}╠══════════════════════════════════════════════════════════════╣${RST}`);
  console.log(`${W}║  WebSocket:  ${BOLD}${wsUrl}${RST}${W}                         ║${RST}`);
  console.log(`${W}║  Engines:    ${C}Godot 4.x${RST}${W} + ${M}Unreal Engine 5${RST}${W}                  ║${RST}`);
  console.log(`${W}║  Exporters:  GDScript signals + MetaHuman face morphs        ║${RST}`);
  console.log(`${BOLD}${W}╚══════════════════════════════════════════════════════════════╝${RST}\n`);

  // Create dispatcher
  const dispatcher = new EpochDispatcher({
    wsUrl,
    reconnectMs: 3000,
    onError: (err) => {
      console.error(`${R}VALIDATION ERROR${RST}: ${err.channel}`);
      for (const issue of err.zodErrors) {
        console.error(`  ${DIM}${issue.path.join('.')}:${RST} ${issue.message}`);
      }
    },
  });

  // Attach exporters
  const godotExporter = new GodotExporter(onGodotFrame);
  const ue5Exporter = new UE5Exporter(onUE5Frame);

  godotExporter.attach(dispatcher);
  ue5Exporter.attach(dispatcher);

  // Also log raw system-status
  dispatcher.on('system-status', (data, timestamp) => {
    console.log(`\n${ts()} ${G}${BOLD}═══ SYSTEM STATUS ═══${RST}`);
    console.log(`  ${DIM}${JSON.stringify(data, null, 2)}${RST}`);
  });

  // Connect
  console.log(`${DIM}Connecting to ${wsUrl}...${RST}`);
  console.log(`${DIM}Press Ctrl+C to disconnect.${RST}\n`);

  try {
    // Dynamic import of 'ws' for Node.js WebSocket
    const wsModule = await import('ws');
    dispatcher.connect(wsModule.default as unknown as typeof WebSocket);
    console.log(`${G}Connected. Waiting for events...${RST}\n`);
  } catch (err) {
    console.log(`${Y}Could not connect to ${wsUrl}${RST}`);
    console.log(`${DIM}Make sure the Epoch Engine WebSocket server is running.${RST}`);
    console.log(`${DIM}Start with: cd orchestration && npm run dev${RST}\n`);
    console.log(`${W}Tip: Run the doomsday scenario in local mode instead:${RST}`);
    console.log(`${BOLD}  npx tsx scripts/run_doomsday_scenario.ts${RST}\n`);
    process.exit(1);
  }

  // Stats ticker
  const statsInterval = setInterval(() => {
    const s = dispatcher.stats;
    if (s.totalReceived > 0) {
      console.log(`\n${DIM}── Stats: received=${s.totalReceived} dispatched=${s.totalDispatched} errors=${s.totalErrors} godot=${godotTotal} ue5=${ue5Total} ──${RST}`);
    }
  }, 10000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n\n${BOLD}${W}Disconnecting...${RST}`);
    clearInterval(statsInterval);
    dispatcher.disconnect();

    console.log(`\n${BOLD}${W}═══ FINAL STATS ═══${RST}`);
    const s = dispatcher.stats;
    console.log(`  Messages received:    ${s.totalReceived}`);
    console.log(`  Messages dispatched:  ${s.totalDispatched}`);
    console.log(`  Validation errors:    ${s.totalErrors}`);
    console.log(`  Godot frames total:   ${godotTotal}`);
    console.log(`  UE5 frames total:     ${ue5Total}`);
    console.log();
    process.exit(0);
  });
}

main().catch(console.error);
