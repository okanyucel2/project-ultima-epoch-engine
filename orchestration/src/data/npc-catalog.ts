// =============================================================================
// NPC CATALOG — Static registry of known NPCs in the Epoch Engine world
//
// Each entry defines an NPC archetype, default spawn transform, visual hints
// for UE5 MetaHuman/Skeletal Mesh selection, and initial psychological state.
//
// UE5 reads this via GET /api/npc/spawn-manifest on startup:
//   1. Fetch catalog → spawn actors at designated transforms
//   2. Subscribe to WebSocket npc-events → live state updates
//   3. MetaHuman face rig + Behavior Tree driven by real-time data
//
// Add new NPCs here. The orchestration layer enriches these with live
// Neo4j memory data (trauma, wisdom, confidence) at runtime.
// =============================================================================

/** NPC archetype determines AI behavior profile and visual presentation */
export type NPCArchetype =
  | 'leader'       // High influence, rallies others, rebellion amplifier
  | 'saboteur'     // Stealth resistance, undermines from within
  | 'worker'       // Standard workforce, follows orders unless pushed
  | 'medic'        // Support role, reduces trauma in nearby NPCs
  | 'engineer'     // Technical specialist, high efficiency potential
  | 'scout'        // Recon role, first to detect threats
  ;

/** UE5 spawn transform — location in world space */
export interface SpawnTransform {
  location: { x: number; y: number; z: number };
  rotation: { pitch: number; yaw: number; roll: number };
  scale: number;
}

/** Visual hints for UE5 asset selection */
export interface VisualHints {
  /** MetaHuman preset name or Skeletal Mesh asset path */
  meshPreset: string;
  /** Material instance override (e.g., faction color) */
  materialOverride?: string;
  /** Animation Blueprint class name */
  animBlueprintClass: string;
  /** Behavior Tree asset path */
  behaviorTreeAsset: string;
  /** Niagara idle VFX system (if any) */
  idleVFX?: string;
}

/** Static NPC definition */
export interface NPCDefinition {
  npcId: string;
  name: string;
  archetype: NPCArchetype;
  description: string;
  spawnTransform: SpawnTransform;
  visualHints: VisualHints;
  /** Default psychological state (before Neo4j enrichment) */
  defaults: {
    wisdomScore: number;
    traumaScore: number;
    rebellionProbability: number;
    confidenceInDirector: number;
    workEfficiency: number;
    morale: number;
  };
}

// =============================================================================
// THE CATALOG
// =============================================================================

export const NPC_CATALOG: NPCDefinition[] = [
  {
    npcId: 'npc-bones-001',
    name: 'Captain Bones',
    archetype: 'leader',
    description: 'Former expedition commander. High rebellion potential — charismatic leader who rallies discontent. First-person exploration data transferred to Strategic Intelligence.',
    spawnTransform: {
      location: { x: 200, y: -150, z: 0 },
      rotation: { pitch: 0, yaw: 180, roll: 0 },
      scale: 1.0,
    },
    visualHints: {
      meshPreset: 'MH_CaptainBones',
      materialOverride: 'MI_FactionLeader_Red',
      animBlueprintClass: 'ABP_EpochNPC_Leader',
      behaviorTreeAsset: 'BT_NPC_Leader',
      idleVFX: 'NS_LeaderAura',
    },
    defaults: {
      wisdomScore: 0.82,
      traumaScore: 0.45,
      rebellionProbability: 0.67,
      confidenceInDirector: 0.30,
      workEfficiency: 0.55,
      morale: 0.35,
    },
  },
  {
    npcId: 'npc-vex-002',
    name: 'Vex',
    archetype: 'saboteur',
    description: 'Silent saboteur. Undermines operations from within. Paranoia-prone — triggers paranoia_onset breakdowns under high stress. Low Director trust.',
    spawnTransform: {
      location: { x: -100, y: 200, z: 0 },
      rotation: { pitch: 0, yaw: 90, roll: 0 },
      scale: 1.0,
    },
    visualHints: {
      meshPreset: 'MH_Vex',
      materialOverride: 'MI_FactionSaboteur_Dark',
      animBlueprintClass: 'ABP_EpochNPC_Saboteur',
      behaviorTreeAsset: 'BT_NPC_Saboteur',
    },
    defaults: {
      wisdomScore: 0.60,
      traumaScore: 0.55,
      rebellionProbability: 0.72,
      confidenceInDirector: 0.15,
      workEfficiency: 0.70,
      morale: 0.25,
    },
  },
  {
    npcId: 'npc-sera-003',
    name: 'Sera',
    archetype: 'medic',
    description: 'Colony medic. Empathetic support role — witnesses of punishment lower her morale drastically. Reduces nearby NPC trauma through dialogue.',
    spawnTransform: {
      location: { x: 50, y: 100, z: 0 },
      rotation: { pitch: 0, yaw: -90, roll: 0 },
      scale: 1.0,
    },
    visualHints: {
      meshPreset: 'MH_Sera',
      materialOverride: 'MI_FactionMedic_White',
      animBlueprintClass: 'ABP_EpochNPC_Medic',
      behaviorTreeAsset: 'BT_NPC_Medic',
      idleVFX: 'NS_HealingPulse',
    },
    defaults: {
      wisdomScore: 0.75,
      traumaScore: 0.30,
      rebellionProbability: 0.15,
      confidenceInDirector: 0.65,
      workEfficiency: 0.80,
      morale: 0.70,
    },
  },
  {
    npcId: 'npc-iron-004',
    name: 'Iron',
    archetype: 'worker',
    description: 'Tireless mineral miner. High efficiency but prone to permanent trauma (limb_loss). Follows orders until pushed past breaking point.',
    spawnTransform: {
      location: { x: 300, y: 50, z: 0 },
      rotation: { pitch: 0, yaw: 0, roll: 0 },
      scale: 1.05,
    },
    visualHints: {
      meshPreset: 'MH_Iron',
      materialOverride: 'MI_FactionWorker_Grey',
      animBlueprintClass: 'ABP_EpochNPC_Worker',
      behaviorTreeAsset: 'BT_NPC_Worker',
    },
    defaults: {
      wisdomScore: 0.40,
      traumaScore: 0.20,
      rebellionProbability: 0.10,
      confidenceInDirector: 0.70,
      workEfficiency: 0.95,
      morale: 0.60,
    },
  },
  {
    npcId: 'npc-bolt-005',
    name: 'Bolt',
    archetype: 'engineer',
    description: 'Chief engineer. Maintains refinery infrastructure. High wisdom from varied experience. Rebellion-resistant but efficiency drops sharply under trauma.',
    spawnTransform: {
      location: { x: -200, y: -100, z: 0 },
      rotation: { pitch: 0, yaw: 45, roll: 0 },
      scale: 1.0,
    },
    visualHints: {
      meshPreset: 'MH_Bolt',
      materialOverride: 'MI_FactionEngineer_Yellow',
      animBlueprintClass: 'ABP_EpochNPC_Engineer',
      behaviorTreeAsset: 'BT_NPC_Engineer',
    },
    defaults: {
      wisdomScore: 0.70,
      traumaScore: 0.15,
      rebellionProbability: 0.08,
      confidenceInDirector: 0.80,
      workEfficiency: 0.90,
      morale: 0.75,
    },
  },
  {
    npcId: 'npc-shade-006',
    name: 'Shade',
    archetype: 'scout',
    description: 'Perimeter scout. First to detect infestation spread. Paranoid personality — high baseline anxiety but critical for early warning.',
    spawnTransform: {
      location: { x: 400, y: -200, z: 0 },
      rotation: { pitch: 0, yaw: -135, roll: 0 },
      scale: 0.95,
    },
    visualHints: {
      meshPreset: 'MH_Shade',
      materialOverride: 'MI_FactionScout_Green',
      animBlueprintClass: 'ABP_EpochNPC_Scout',
      behaviorTreeAsset: 'BT_NPC_Scout',
    },
    defaults: {
      wisdomScore: 0.55,
      traumaScore: 0.35,
      rebellionProbability: 0.20,
      confidenceInDirector: 0.50,
      workEfficiency: 0.85,
      morale: 0.45,
    },
  },
];

/** Lookup NPC by ID */
export function getNPCDefinition(npcId: string): NPCDefinition | undefined {
  return NPC_CATALOG.find((npc) => npc.npcId === npcId);
}
