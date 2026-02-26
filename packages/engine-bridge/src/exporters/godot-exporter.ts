import { BaseExporter } from './base-exporter';
import type { NPCEvent } from '../schemas/npc-events';
import type { SimulationTick } from '../schemas/simulation-ticks';
import type { RebellionAlert } from '../schemas/rebellion-alerts';
import type { TelemetryEvent } from '../schemas/telemetry';
import type { NPCCommand } from '../schemas/npc-commands';

// =============================================================================
// GODOT NATIVE EXPORTER — GDScript Signal & AnimationTree Bridge
//
// Transforms validated Epoch events into Godot-native formats:
//   1. GDScript signals (emit_signal-compatible payloads)
//   2. AnimationTree parameter maps (blend amounts, state transitions)
//   3. Node property update batches
//
// Godot reads these via WebSocket → JSON.parse_string() → signal dispatch.
// The exporter emits output to a callback that Godot's WS client captures.
// =============================================================================

/** Godot AnimationTree parameter map */
export interface GodotAnimationParams {
  /** StateMachine travel target: "idle", "walk", "rebel", "breakdown" */
  stateMachineState: string;
  /** BlendSpace2D position — [agitation, fatigue] */
  blendPosition: [number, number];
  /** Rebellion intensity for shader/particle binding */
  rebellionIntensity: number;
  /** Trauma weight for visual overlay */
  traumaWeight: number;
  /** Movement speed multiplier */
  speedScale: number;
}

/** Godot signal payload (emit_signal compatible) */
export interface GodotSignal {
  signal: string;
  args: Record<string, unknown>;
}

/** Godot node property batch update */
export interface GodotNodeUpdate {
  nodePath: string;
  properties: Record<string, unknown>;
}

/** Output bundle from a single event transformation */
export interface GodotFrame {
  signals: GodotSignal[];
  animationParams: Record<string, GodotAnimationParams>;
  nodeUpdates: GodotNodeUpdate[];
  timestamp: string;
}

/** Callback to receive Godot-native frames */
export type GodotFrameCallback = (frame: GodotFrame) => void;

// ---------------------------------------------------------------------------
// Rebellion thresholds (matches proto / dashboard constants)
// ---------------------------------------------------------------------------
const HALT_THRESHOLD = 0.35;
const VETO_THRESHOLD = 0.80;

// ---------------------------------------------------------------------------
// AnimationTree state derivation
// ---------------------------------------------------------------------------
function deriveAnimState(npc: NPCEvent): string {
  if (npc.status === 'rebelling') return 'rebel';
  if (npc.rebellionProbability > VETO_THRESHOLD) return 'rebel';
  if (npc.rebellionProbability > HALT_THRESHOLD) return 'agitated';
  if (npc.status === 'idle') return 'idle';
  return 'walk';
}

function deriveBlendPosition(npc: NPCEvent): [number, number] {
  // X axis: agitation (0 = calm, 1 = enraged)
  const agitation = Math.min(1, npc.rebellionProbability + (1 - npc.confidenceInDirector) * 0.3);
  // Y axis: fatigue (0 = fresh, 1 = exhausted)
  const fatigue = npc.traumaScore * 0.7 + (1 - (npc.workEfficiency ?? 1)) * 0.3;
  return [
    Math.round(agitation * 1000) / 1000,
    Math.round(Math.min(1, fatigue) * 1000) / 1000,
  ];
}

function deriveSpeedScale(npc: NPCEvent): number {
  if (npc.status === 'rebelling') return 0.3;
  // Work efficiency directly scales movement
  const base = (npc.workEfficiency ?? 1) * (npc.morale ?? 0.5 + 0.5);
  return Math.round(Math.max(0.2, Math.min(1.0, base)) * 100) / 100;
}

// =============================================================================

export class GodotExporter extends BaseExporter {
  readonly engineName = 'Godot 4.x';
  private callback: GodotFrameCallback;

  constructor(callback: GodotFrameCallback) {
    super();
    this.callback = callback;
  }

  onNPCEvent(data: NPCEvent, timestamp: string): void {
    const nodePath = `/root/World/NPCs/${data.npcId}`;
    const animState = deriveAnimState(data);
    const blend = deriveBlendPosition(data);

    const frame: GodotFrame = {
      signals: [
        {
          signal: 'npc_state_updated',
          args: {
            npc_id: data.npcId,
            name: data.name,
            rebellion_probability: data.rebellionProbability,
            trauma_score: data.traumaScore,
            wisdom_score: data.wisdomScore,
            confidence: data.confidenceInDirector,
            status: data.status,
          },
        },
      ],
      animationParams: {
        [data.npcId]: {
          stateMachineState: animState,
          blendPosition: blend,
          rebellionIntensity: data.rebellionProbability,
          traumaWeight: data.traumaScore,
          speedScale: deriveSpeedScale(data),
        },
      },
      nodeUpdates: [
        {
          nodePath,
          properties: {
            'npc_data/rebellion_probability': data.rebellionProbability,
            'npc_data/trauma_score': data.traumaScore,
            'npc_data/morale': data.morale ?? 0.5,
            'npc_data/status': data.status,
            'npc_data/memory_count': data.memoryCount,
          },
        },
        {
          nodePath: `${nodePath}/RebellionAura`,
          properties: {
            visible: data.rebellionProbability > HALT_THRESHOLD,
            'material:shader_parameter/intensity': data.rebellionProbability,
            'material:shader_parameter/color': rebellionColor(data.rebellionProbability),
          },
        },
      ],
      timestamp,
    };

    this.callback(frame);
  }

  onSimulationTick(data: SimulationTick, timestamp: string): void {
    const frame: GodotFrame = {
      signals: [
        {
          signal: 'simulation_tick',
          args: {
            tick_number: data.tickNumber,
            active_npcs: data.population.activeNPCs,
            overall_rebellion: data.population.overallRebellionProbability,
            plague_heart: data.infestation.isPlagueHeart,
            infestation_counter: data.infestation.counter,
          },
        },
      ],
      animationParams: {},
      nodeUpdates: [
        {
          nodePath: '/root/World/Environment',
          properties: {
            'fog/density': data.infestation.counter / 100 * 0.8,
            'post_process/saturation': 1.0 - data.infestation.counter / 100 * 0.5,
            'time_scale': data.infestation.throttleMultiplier,
          },
        },
        {
          nodePath: '/root/UI/ResourcePanel',
          properties: {
            'sim_quantity': data.resources.sim.quantity,
            'rapidlum_quantity': data.resources.rapidlum.quantity,
            'mineral_quantity': data.resources.mineral.quantity,
          },
        },
      ],
      timestamp,
    };

    this.callback(frame);
  }

  onRebellionAlert(data: RebellionAlert, timestamp: string): void {
    const signalName = data.vetoedByAegis ? 'aegis_veto_fired' : 'rebellion_triggered';

    const frame: GodotFrame = {
      signals: [
        {
          signal: signalName,
          args: {
            event_id: data.eventId,
            npc_id: data.npcId,
            npc_name: data.npcName,
            probability: data.probability,
            rebellion_type: data.rebellionType,
            vetoed: data.vetoedByAegis,
            veto_reason: data.vetoReason,
          },
        },
      ],
      animationParams: data.vetoedByAegis
        ? {}
        : {
            [data.npcId]: {
              stateMachineState: 'rebel',
              blendPosition: [1.0, 0.5],
              rebellionIntensity: data.probability,
              traumaWeight: 0.5,
              speedScale: 0.3,
            },
          },
      nodeUpdates: data.vetoedByAegis
        ? [
            {
              nodePath: `/root/World/NPCs/${data.npcId}/AEGISShield`,
              properties: { visible: true, 'animation_player:current_animation': 'containment' },
            },
          ]
        : [
            {
              nodePath: `/root/World/NPCs/${data.npcId}/RebellionVFX`,
              properties: {
                emitting: true,
                'process_material:emission_intensity': data.probability * 2.0,
              },
            },
          ],
      timestamp,
    };

    this.callback(frame);
  }

  onNPCCommand(data: NPCCommand, timestamp: string): void {
    const signals: GodotSignal[] = [
      {
        signal: 'npc_command_received',
        args: {
          npc_id: data.npcId,
          command_id: data.commandId,
          command_type: data.commandType,
          payload: data.payload,
          priority: data.priority ?? 1,
        },
      },
    ];

    const nodeUpdates: GodotNodeUpdate[] = [];

    if (data.commandType === 'move_to') {
      const payload = data.payload as { targetLocation: { x: number; y: number; z: number }; movementMode?: string };
      nodeUpdates.push({
        nodePath: `/root/World/NPCs/${data.npcId}/NavigationAgent3D`,
        properties: {
          'target_position:x': payload.targetLocation.x,
          'target_position:y': payload.targetLocation.y,
          'target_position:z': payload.targetLocation.z,
        },
      });
    }

    this.callback({
      signals,
      animationParams: {},
      nodeUpdates,
      timestamp,
    });
  }

  onTelemetryEvent(data: TelemetryEvent, timestamp: string): void {
    const signals: GodotSignal[] = [];
    const nodeUpdates: GodotNodeUpdate[] = [];

    if (data.type === 'mental_breakdown' && data.mentalBreakdown) {
      signals.push({
        signal: 'mental_breakdown',
        args: {
          npc_id: data.npcId,
          breakdown_type: data.mentalBreakdown.breakdownType,
          intensity: data.mentalBreakdown.intensity,
          severity: data.severity,
        },
      });
      nodeUpdates.push({
        nodePath: `/root/World/NPCs/${data.npcId}/BreakdownVFX`,
        properties: {
          emitting: true,
          'process_material:color': breakdownColor(data.mentalBreakdown.breakdownType),
        },
      });
    }

    if (data.type === 'permanent_trauma' && data.permanentTrauma) {
      signals.push({
        signal: 'permanent_trauma_inflicted',
        args: {
          npc_id: data.npcId,
          trauma_type: data.permanentTrauma.traumaType,
          severity: data.permanentTrauma.severity,
          affected_attribute: data.permanentTrauma.affectedAttribute,
          reduction: data.permanentTrauma.attributeReduction,
        },
      });
      nodeUpdates.push({
        nodePath: `/root/World/NPCs/${data.npcId}/TraumaScar`,
        properties: {
          visible: true,
          'trauma_type': data.permanentTrauma.traumaType,
          'material:shader_parameter/scar_intensity': data.permanentTrauma.severity,
        },
      });
    }

    if (data.type === 'state_change' && data.stateChange) {
      signals.push({
        signal: 'npc_stat_changed',
        args: {
          npc_id: data.npcId,
          attribute: data.stateChange.attribute,
          old_value: data.stateChange.oldValue,
          new_value: data.stateChange.newValue,
          cause: data.stateChange.cause,
        },
      });
    }

    const frame: GodotFrame = {
      signals,
      animationParams: {},
      nodeUpdates,
      timestamp,
    };

    this.callback(frame);
  }
}

// ---------------------------------------------------------------------------
// Color utilities for Godot shader parameters
// ---------------------------------------------------------------------------

function rebellionColor(probability: number): { r: number; g: number; b: number } {
  if (probability <= 0.5) {
    const t = probability / 0.5;
    return {
      r: Math.round((34 + t * (245 - 34)) / 255 * 100) / 100,
      g: Math.round((197 + t * (158 - 197)) / 255 * 100) / 100,
      b: Math.round((94 + t * (11 - 94)) / 255 * 100) / 100,
    };
  }
  const t = (probability - 0.5) / 0.5;
  return {
    r: Math.round((245 + t * (220 - 245)) / 255 * 100) / 100,
    g: Math.round((158 + t * (38 - 158)) / 255 * 100) / 100,
    b: Math.round((11 + t * (38 - 11)) / 255 * 100) / 100,
  };
}

function breakdownColor(type: string): { r: number; g: number; b: number } {
  const colors: Record<string, { r: number; g: number; b: number }> = {
    stress_spike: { r: 1.0, g: 0.6, b: 0.0 },
    psychological_fracture: { r: 0.8, g: 0.0, b: 0.8 },
    identity_crisis: { r: 0.5, g: 0.5, b: 1.0 },
    paranoia_onset: { r: 0.9, g: 0.1, b: 0.1 },
    dissociation: { r: 0.4, g: 0.4, b: 0.6 },
    rage_episode: { r: 1.0, g: 0.0, b: 0.0 },
  };
  return colors[type] ?? { r: 1.0, g: 1.0, b: 1.0 };
}
