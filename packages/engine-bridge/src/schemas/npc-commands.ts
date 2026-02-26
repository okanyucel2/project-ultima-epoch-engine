import { z } from 'zod';

// =============================================================================
// NPC COMMANDS CHANNEL — Server-to-client navigation & action commands
//
// Orchestration sends movement/action commands via WebSocket.
// UE5/Godot clients consume these to drive AI Controllers and NavMesh.
//
// Dumb Client doctrine: UE5 NEVER decides where to go — it only executes
// MoveTo commands from the orchestration layer.
// =============================================================================

/** Movement mode for NPC navigation */
export const MovementModeSchema = z.enum(['walk', 'run', 'sprint', 'crouch']);

/** 3D world-space coordinate */
export const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

/** NPC command types */
export const NPCCommandTypeSchema = z.enum([
  'move_to',     // Navigate to world-space location
  'stop',        // Halt all movement immediately
  'look_at',     // Rotate to face a target location
  'play_montage', // Trigger animation montage by name
]);

/** MoveTo command payload */
export const MoveToPayloadSchema = z.object({
  targetLocation: Vec3Schema,
  movementMode: MovementModeSchema.default('walk'),
  /** Acceptance radius in UE5 units (cm). Default 50 */
  acceptanceRadius: z.number().positive().default(50),
});

/** Stop command payload */
export const StopPayloadSchema = z.object({
  /** If true, interrupt current montage too */
  interruptMontage: z.boolean().default(false),
});

/** LookAt command payload */
export const LookAtPayloadSchema = z.object({
  targetLocation: Vec3Schema,
});

/** PlayMontage command payload */
export const PlayMontagePayloadSchema = z.object({
  montageName: z.string(),
  playRate: z.number().positive().default(1.0),
});

/** Full NPC command message */
export const NPCCommandSchema = z.object({
  /** Unique command ID for tracking */
  commandId: z.string(),
  /** Target NPC ID (matches npc-catalog npcId) */
  npcId: z.string(),
  /** Command type */
  commandType: NPCCommandTypeSchema,
  /** Command-specific payload */
  payload: z.union([
    MoveToPayloadSchema,
    StopPayloadSchema,
    LookAtPayloadSchema,
    PlayMontagePayloadSchema,
  ]),
  /** Priority: higher = override current action. Default 1 */
  priority: z.number().int().min(0).max(10).default(1),
});

/** Batch command — send to multiple NPCs at once */
export const NPCCommandBatchSchema = z.object({
  commands: z.array(NPCCommandSchema).min(1).max(50),
});

export type MovementMode = z.infer<typeof MovementModeSchema>;
export type Vec3 = z.infer<typeof Vec3Schema>;
export type NPCCommandType = z.infer<typeof NPCCommandTypeSchema>;
export type MoveToPayload = z.infer<typeof MoveToPayloadSchema>;
export type StopPayload = z.infer<typeof StopPayloadSchema>;
export type LookAtPayload = z.infer<typeof LookAtPayloadSchema>;
export type PlayMontagePayload = z.infer<typeof PlayMontagePayloadSchema>;
export type NPCCommand = z.infer<typeof NPCCommandSchema>;
export type NPCCommandBatch = z.infer<typeof NPCCommandBatchSchema>;
