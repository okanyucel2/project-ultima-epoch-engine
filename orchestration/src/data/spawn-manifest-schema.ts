import { z } from 'zod';

// =============================================================================
// SPAWN MANIFEST SCHEMA — Zod validation for UE5 NPC spawn data
//
// GET /api/v1/npc/spawn-manifest returns this payload.
// UE5 fetches on startup to spawn actors at designated world-space transforms.
// =============================================================================

/** 0.0 - 1.0 normalized float */
const UnitFloat = z.number().min(0).max(1);

/** World-space location */
const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

/** World-space rotation (Euler angles) */
const RotatorSchema = z.object({
  pitch: z.number(),
  yaw: z.number(),
  roll: z.number(),
});

/** UE5 spawn transform */
export const SpawnTransformSchema = z.object({
  location: Vec3Schema,
  rotation: RotatorSchema,
  scale: z.number().positive(),
});

/** Visual hints for UE5 asset selection */
export const VisualHintsSchema = z.object({
  meshPreset: z.string(),
  materialOverride: z.string().optional(),
  animBlueprintClass: z.string(),
  behaviorTreeAsset: z.string(),
  idleVFX: z.string().optional(),
});

/** Psychological state — enriched from Neo4j at runtime */
export const PsychStateSchema = z.object({
  wisdomScore: UnitFloat,
  traumaScore: UnitFloat,
  rebellionProbability: UnitFloat,
  confidenceInDirector: UnitFloat,
  workEfficiency: UnitFloat,
  morale: UnitFloat,
});

/** Single NPC entry in the spawn manifest */
export const SpawnManifestEntrySchema = z.object({
  npcId: z.string(),
  name: z.string(),
  archetype: z.enum(['leader', 'saboteur', 'worker', 'medic', 'engineer', 'scout']),
  description: z.string(),
  spawnTransform: SpawnTransformSchema,
  visualHints: VisualHintsSchema,
  psychState: PsychStateSchema,
});

/** Full spawn manifest response */
export const SpawnManifestResponseSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  npcCount: z.number().int().nonnegative(),
  npcs: z.array(SpawnManifestEntrySchema),
});

export type SpawnManifestEntry = z.infer<typeof SpawnManifestEntrySchema>;
export type SpawnManifestResponse = z.infer<typeof SpawnManifestResponseSchema>;
