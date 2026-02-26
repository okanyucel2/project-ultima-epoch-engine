import { BaseExporter } from './base-exporter';
import type { NPCEvent } from '../schemas/npc-events';
import type { SimulationTick } from '../schemas/simulation-ticks';
import type { RebellionAlert } from '../schemas/rebellion-alerts';
import type { TelemetryEvent } from '../schemas/telemetry';
import type { NPCCommand, MoveToPayload, LookAtPayload } from '../schemas/npc-commands';

// =============================================================================
// UE5 METAHUMAN EXPORTER — C++ Struct & Behavior Tree Bridge
//
// Transforms validated Epoch events into UE5-native formats:
//   1. FEpochNPCState structs (JSON matching USTRUCT layout)
//   2. Behavior Tree blackboard key-value pairs
//   3. MetaHuman morph target weights for facial expressions
//   4. Niagara VFX trigger commands
//   5. Material Dynamic Instance parameter updates
//
// UE5 reads these via WebSocket plugin → JSON deserialization →
// UpdateBlackboard() → AnimBP evaluation → MetaHuman face rig.
// =============================================================================

/** UE5 USTRUCT-compatible NPC state */
export interface FEpochNPCState {
  NPCId: string;
  Name: string;
  WisdomScore: number;
  TraumaScore: number;
  RebellionProbability: number;
  ConfidenceInDirector: number;
  WorkEfficiency: number;
  Morale: number;
  MemoryCount: number;
  Status: 'Active' | 'Idle' | 'Rebelling';
}

/** Behavior Tree blackboard key-value pairs */
export interface BehaviorTreeBlackboard {
  /** NPC ID for actor lookup */
  NPCId: string;
  /** Blackboard key-value pairs (FName → value) */
  keys: Record<string, string | number | boolean>;
}

/** MetaHuman morph target weights for facial animation */
export interface MetaHumanFaceState {
  npcId: string;
  /** Morph target name → weight (0.0-1.0) */
  morphTargets: Record<string, number>;
  /** Emotion blend: maps to UE5 Animation Curve */
  emotionCurves: Record<string, number>;
}

/** Niagara VFX trigger */
export interface NiagaraTrigger {
  npcId: string;
  systemName: string;
  action: 'activate' | 'deactivate' | 'burst';
  parameters: Record<string, number | boolean>;
}

/** Material parameter update */
export interface MaterialParameterUpdate {
  npcId: string;
  parameterName: string;
  value: number;
}

/** Complete UE5 frame output */
export interface UE5Frame {
  structs: FEpochNPCState[];
  blackboards: BehaviorTreeBlackboard[];
  faceStates: MetaHumanFaceState[];
  vfxTriggers: NiagaraTrigger[];
  materialParams: MaterialParameterUpdate[];
  timestamp: string;
}

export type UE5FrameCallback = (frame: UE5Frame) => void;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
const HALT_THRESHOLD = 0.35;
const VETO_THRESHOLD = 0.80;

// ---------------------------------------------------------------------------
// MetaHuman emotion derivation
// ---------------------------------------------------------------------------

function deriveEmotions(npc: NPCEvent): { morphTargets: Record<string, number>; emotionCurves: Record<string, number> } {
  const rebellion = npc.rebellionProbability;
  const trauma = npc.traumaScore;
  const morale = npc.morale ?? 0.5;
  const confidence = npc.confidenceInDirector;

  // ARKit-compatible morph targets for MetaHuman
  const morphTargets: Record<string, number> = {
    // Brow
    browDownLeft: Math.min(1, rebellion * 0.8 + trauma * 0.3),
    browDownRight: Math.min(1, rebellion * 0.8 + trauma * 0.3),
    browInnerUp: trauma > 0.6 ? trauma * 0.7 : 0,
    // Eyes
    eyeSquintLeft: rebellion > 0.5 ? rebellion * 0.6 : 0,
    eyeSquintRight: rebellion > 0.5 ? rebellion * 0.6 : 0,
    eyeWideLeft: trauma > 0.7 ? (trauma - 0.7) * 3 : 0,
    eyeWideRight: trauma > 0.7 ? (trauma - 0.7) * 3 : 0,
    // Mouth
    mouthFrownLeft: Math.min(1, (1 - morale) * 0.8),
    mouthFrownRight: Math.min(1, (1 - morale) * 0.8),
    mouthSmileLeft: morale > 0.7 ? (morale - 0.7) * 3 : 0,
    mouthSmileRight: morale > 0.7 ? (morale - 0.7) * 3 : 0,
    jawOpen: rebellion > VETO_THRESHOLD ? 0.3 : 0,
    // Nose
    noseSneerLeft: rebellion > 0.6 ? (rebellion - 0.6) * 2 : 0,
    noseSneerRight: rebellion > 0.6 ? (rebellion - 0.6) * 2 : 0,
  };

  // Round all morph target values
  for (const key of Object.keys(morphTargets)) {
    morphTargets[key] = Math.round(Math.min(1, Math.max(0, morphTargets[key])) * 1000) / 1000;
  }

  const emotionCurves: Record<string, number> = {
    Anger: Math.min(1, rebellion * 0.7 + (1 - confidence) * 0.3),
    Fear: trauma > 0.5 ? Math.min(1, (trauma - 0.5) * 2) : 0,
    Sadness: Math.min(1, (1 - morale) * 0.6 + trauma * 0.4),
    Contempt: rebellion > 0.4 ? Math.min(1, (rebellion - 0.4) * 1.5 * (1 - confidence)) : 0,
    Neutral: Math.max(0, 1 - rebellion - trauma * 0.5),
  };

  for (const key of Object.keys(emotionCurves)) {
    emotionCurves[key] = Math.round(Math.min(1, Math.max(0, emotionCurves[key])) * 1000) / 1000;
  }

  return { morphTargets, emotionCurves };
}

// ---------------------------------------------------------------------------
// Behavior Tree state derivation
// ---------------------------------------------------------------------------

function deriveBlackboard(npc: NPCEvent): Record<string, string | number | boolean> {
  return {
    // State flags
    IsRebelling: npc.status === 'rebelling',
    IsIdle: npc.status === 'idle',
    IsAgitated: npc.rebellionProbability > HALT_THRESHOLD,
    IsCritical: npc.rebellionProbability > VETO_THRESHOLD,
    // Numeric values for BT decorators
    RebellionProbability: npc.rebellionProbability,
    TraumaScore: npc.traumaScore,
    Morale: npc.morale ?? 0.5,
    WorkEfficiency: npc.workEfficiency ?? 1.0,
    ConfidenceInDirector: npc.confidenceInDirector,
    WisdomScore: npc.wisdomScore,
    MemoryCount: npc.memoryCount,
    // Derived behavioral parameters
    MovementSpeed: npc.status === 'rebelling' ? 0.3 : (npc.workEfficiency ?? 1.0) * 0.8 + 0.2,
    AggressionLevel: Math.min(1, npc.rebellionProbability * 0.6 + (1 - npc.confidenceInDirector) * 0.4),
    CooperationWillingness: Math.max(0, npc.confidenceInDirector * 0.7 + (npc.morale ?? 0.5) * 0.3),
    // Target selection
    PreferredBehavior: npc.status === 'rebelling'
      ? 'Rebel'
      : npc.rebellionProbability > HALT_THRESHOLD
        ? 'Resist'
        : 'Comply',
  };
}

// ---------------------------------------------------------------------------
// UE5 enum mapping
// ---------------------------------------------------------------------------

function mapStatus(status: string): 'Active' | 'Idle' | 'Rebelling' {
  if (status === 'rebelling') return 'Rebelling';
  if (status === 'idle') return 'Idle';
  return 'Active';
}

// =============================================================================

export class UE5Exporter extends BaseExporter {
  readonly engineName = 'Unreal Engine 5';
  private callback: UE5FrameCallback;

  constructor(callback: UE5FrameCallback) {
    super();
    this.callback = callback;
  }

  onNPCEvent(data: NPCEvent, timestamp: string): void {
    const fState: FEpochNPCState = {
      NPCId: data.npcId,
      Name: data.name,
      WisdomScore: data.wisdomScore,
      TraumaScore: data.traumaScore,
      RebellionProbability: data.rebellionProbability,
      ConfidenceInDirector: data.confidenceInDirector,
      WorkEfficiency: data.workEfficiency ?? 1.0,
      Morale: data.morale ?? 0.5,
      MemoryCount: data.memoryCount,
      Status: mapStatus(data.status),
    };

    const blackboard: BehaviorTreeBlackboard = {
      NPCId: data.npcId,
      keys: deriveBlackboard(data),
    };

    const { morphTargets, emotionCurves } = deriveEmotions(data);
    const faceState: MetaHumanFaceState = {
      npcId: data.npcId,
      morphTargets,
      emotionCurves,
    };

    const vfxTriggers: NiagaraTrigger[] = [];
    const materialParams: MaterialParameterUpdate[] = [
      { npcId: data.npcId, parameterName: 'RebellionIntensity', value: data.rebellionProbability },
      { npcId: data.npcId, parameterName: 'TraumaWeight', value: data.traumaScore },
      { npcId: data.npcId, parameterName: 'MoraleLevel', value: data.morale ?? 0.5 },
    ];

    // Rebellion aura VFX
    if (data.rebellionProbability > HALT_THRESHOLD) {
      vfxTriggers.push({
        npcId: data.npcId,
        systemName: 'NS_RebellionAura',
        action: 'activate',
        parameters: {
          Intensity: data.rebellionProbability,
          IsVetoRange: data.rebellionProbability > VETO_THRESHOLD,
        },
      });
    } else {
      vfxTriggers.push({
        npcId: data.npcId,
        systemName: 'NS_RebellionAura',
        action: 'deactivate',
        parameters: {},
      });
    }

    this.callback({
      structs: [fState],
      blackboards: [blackboard],
      faceStates: [faceState],
      vfxTriggers,
      materialParams,
      timestamp,
    });
  }

  onNPCCommand(data: NPCCommand, timestamp: string): void {
    const blackboard: BehaviorTreeBlackboard = {
      NPCId: data.npcId,
      keys: {
        CommandId: data.commandId,
        CommandType: data.commandType,
        CommandPriority: data.priority ?? 1,
      },
    };

    if (data.commandType === 'move_to') {
      const payload = data.payload as MoveToPayload;
      blackboard.keys.TargetLocationX = payload.targetLocation.x;
      blackboard.keys.TargetLocationY = payload.targetLocation.y;
      blackboard.keys.TargetLocationZ = payload.targetLocation.z;
      blackboard.keys.HasMoveTarget = true;
      blackboard.keys.AcceptanceRadius = payload.acceptanceRadius ?? 50;

      // Movement mode → speed multiplier for Animation Blueprint
      const speedMap: Record<string, number> = {
        walk: 0.35,
        run: 0.7,
        sprint: 1.0,
        crouch: 0.2,
      };
      blackboard.keys.MovementSpeed = speedMap[payload.movementMode ?? 'walk'] ?? 0.35;
      blackboard.keys.MovementMode = payload.movementMode ?? 'walk';
    } else if (data.commandType === 'stop') {
      blackboard.keys.HasMoveTarget = false;
      blackboard.keys.MovementSpeed = 0;
      blackboard.keys.TargetLocationX = 0;
      blackboard.keys.TargetLocationY = 0;
      blackboard.keys.TargetLocationZ = 0;
    } else if (data.commandType === 'look_at') {
      const payload = data.payload as LookAtPayload;
      blackboard.keys.LookAtX = payload.targetLocation.x;
      blackboard.keys.LookAtY = payload.targetLocation.y;
      blackboard.keys.LookAtZ = payload.targetLocation.z;
      blackboard.keys.HasLookAtTarget = true;
    } else if (data.commandType === 'play_montage') {
      const payload = data.payload as { montageName: string; playRate?: number };
      blackboard.keys.MontageName = payload.montageName;
      blackboard.keys.MontagePlayRate = payload.playRate ?? 1.0;
    }

    this.callback({
      structs: [],
      blackboards: [blackboard],
      faceStates: [],
      vfxTriggers: [],
      materialParams: [],
      timestamp,
    });
  }

  onSimulationTick(data: SimulationTick, timestamp: string): void {
    const vfxTriggers: NiagaraTrigger[] = [];

    if (data.infestation.isPlagueHeart) {
      vfxTriggers.push({
        npcId: '__world__',
        systemName: 'NS_PlagueHeart',
        action: 'activate',
        parameters: {
          InfestationLevel: data.infestation.counter / 100,
          ThrottleMultiplier: data.infestation.throttleMultiplier,
        },
      });
    }

    const materialParams: MaterialParameterUpdate[] = [
      { npcId: '__world__', parameterName: 'GlobalRebellionTint', value: data.population.overallRebellionProbability },
      { npcId: '__world__', parameterName: 'InfestationFog', value: data.infestation.counter / 100 },
      { npcId: '__world__', parameterName: 'WorldDesaturation', value: data.infestation.counter / 100 * 0.5 },
    ];

    this.callback({
      structs: [],
      blackboards: [],
      faceStates: [],
      vfxTriggers,
      materialParams,
      timestamp,
    });
  }

  onRebellionAlert(data: RebellionAlert, timestamp: string): void {
    const vfxTriggers: NiagaraTrigger[] = [];

    if (data.vetoedByAegis) {
      vfxTriggers.push({
        npcId: data.npcId,
        systemName: 'NS_AEGISContainment',
        action: 'burst',
        parameters: { Intensity: 1.0, Duration: 3.0 },
      });
    } else {
      const systemMap: Record<string, string> = {
        passive: 'NS_RebellionPassive',
        active: 'NS_RebellionActive',
        collective: 'NS_RebellionCollective',
      };
      vfxTriggers.push({
        npcId: data.npcId,
        systemName: systemMap[data.rebellionType] ?? 'NS_RebellionActive',
        action: 'burst',
        parameters: {
          Probability: data.probability,
          IsCollective: data.rebellionType === 'collective',
        },
      });
    }

    const blackboard: BehaviorTreeBlackboard = {
      NPCId: data.npcId,
      keys: {
        IsRebelling: !data.vetoedByAegis,
        RebellionProbability: data.probability,
        RebellionType: data.rebellionType,
        WasVetoed: data.vetoedByAegis,
        PreferredBehavior: data.vetoedByAegis ? 'Stunned' : 'Rebel',
      },
    };

    this.callback({
      structs: [],
      blackboards: [blackboard],
      faceStates: [],
      vfxTriggers,
      materialParams: [],
      timestamp,
    });
  }

  onTelemetryEvent(data: TelemetryEvent, timestamp: string): void {
    const vfxTriggers: NiagaraTrigger[] = [];
    const faceStates: MetaHumanFaceState[] = [];

    if (data.type === 'mental_breakdown' && data.mentalBreakdown) {
      vfxTriggers.push({
        npcId: data.npcId,
        systemName: 'NS_PsychFracture',
        action: 'burst',
        parameters: {
          BreakdownType: breakdownTypeIndex(data.mentalBreakdown.breakdownType),
          Intensity: data.mentalBreakdown.intensity,
        },
      });

      // Extreme facial expression during breakdown
      faceStates.push({
        npcId: data.npcId,
        morphTargets: breakdownFaceMorphs(data.mentalBreakdown.breakdownType, data.mentalBreakdown.intensity),
        emotionCurves: {
          Fear: data.mentalBreakdown.breakdownType === 'paranoia_onset' ? 1.0 : 0.3,
          Anger: data.mentalBreakdown.breakdownType === 'rage_episode' ? 1.0 : 0.2,
          Sadness: data.mentalBreakdown.breakdownType === 'dissociation' ? 0.8 : 0.1,
          Surprise: data.mentalBreakdown.breakdownType === 'psychological_fracture' ? 0.9 : 0,
          Neutral: 0,
        },
      });
    }

    if (data.type === 'permanent_trauma' && data.permanentTrauma) {
      vfxTriggers.push({
        npcId: data.npcId,
        systemName: 'NS_TraumaScar',
        action: 'activate',
        parameters: {
          TraumaType: traumaTypeIndex(data.permanentTrauma.traumaType),
          Severity: data.permanentTrauma.severity,
          Permanent: true,
        },
      });
    }

    this.callback({
      structs: [],
      blackboards: [],
      faceStates,
      vfxTriggers,
      materialParams: [],
      timestamp,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function breakdownTypeIndex(type: string): number {
  const map: Record<string, number> = {
    stress_spike: 1, psychological_fracture: 2, identity_crisis: 3,
    paranoia_onset: 4, dissociation: 5, rage_episode: 6,
  };
  return map[type] ?? 0;
}

function traumaTypeIndex(type: string): number {
  const map: Record<string, number> = {
    limb_loss: 1, morale_collapse: 2, ptsd: 3,
    survivors_guilt: 4, phobia: 5, brain_damage: 6,
  };
  return map[type] ?? 0;
}

function breakdownFaceMorphs(type: string, intensity: number): Record<string, number> {
  const base: Record<string, number> = {
    browDownLeft: 0, browDownRight: 0, browInnerUp: 0,
    eyeWideLeft: 0, eyeWideRight: 0, eyeSquintLeft: 0, eyeSquintRight: 0,
    jawOpen: 0, mouthFrownLeft: 0, mouthFrownRight: 0,
  };

  switch (type) {
    case 'rage_episode':
      base.browDownLeft = intensity; base.browDownRight = intensity;
      base.eyeSquintLeft = intensity * 0.8; base.eyeSquintRight = intensity * 0.8;
      base.jawOpen = intensity * 0.6; base.noseSneerLeft = intensity; base.noseSneerRight = intensity;
      break;
    case 'paranoia_onset':
      base.eyeWideLeft = intensity; base.eyeWideRight = intensity;
      base.browInnerUp = intensity * 0.7; base.jawOpen = intensity * 0.2;
      break;
    case 'dissociation':
      base.browInnerUp = intensity * 0.3;
      // Minimal expression — blank stare
      break;
    case 'psychological_fracture':
      base.eyeWideLeft = intensity * 0.9; base.eyeWideRight = intensity * 0.5;
      base.browInnerUp = intensity; base.jawOpen = intensity * 0.4;
      base.mouthFrownLeft = intensity * 0.5;
      break;
    case 'stress_spike':
      base.browDownLeft = intensity * 0.6; base.browDownRight = intensity * 0.6;
      base.eyeSquintLeft = intensity * 0.5; base.eyeSquintRight = intensity * 0.5;
      base.mouthFrownLeft = intensity * 0.7; base.mouthFrownRight = intensity * 0.7;
      break;
    case 'identity_crisis':
      base.browInnerUp = intensity * 0.8; base.eyeWideLeft = intensity * 0.4;
      base.mouthFrownLeft = intensity * 0.3; base.mouthFrownRight = intensity * 0.3;
      break;
  }

  // Round and clamp
  for (const key of Object.keys(base)) {
    base[key] = Math.round(Math.min(1, Math.max(0, base[key])) * 1000) / 1000;
  }
  return base;
}
