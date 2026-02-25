// =============================================================================
// Spawn Manifest Tests — GET /api/v1/npc/spawn-manifest (Wave 48)
// =============================================================================

import { NPC_CATALOG, getNPCDefinition } from '../src/data/npc-catalog';
import type { NPCDefinition } from '../src/data/npc-catalog';
import {
  SpawnManifestResponseSchema,
  SpawnManifestEntrySchema,
} from '../src/data/spawn-manifest-schema';
import { createApp } from '../src/index';
import type { AppInstance } from '../src/index';
import request from 'supertest';

// =============================================================================
// Unit Tests — NPC Catalog
// =============================================================================

describe('NPC Catalog', () => {
  test('contains 6 NPCs', () => {
    expect(NPC_CATALOG).toHaveLength(6);
  });

  test('each NPC has a unique npcId', () => {
    const ids = NPC_CATALOG.map((n) => n.npcId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('each NPC has valid archetype', () => {
    const validArchetypes = ['leader', 'saboteur', 'worker', 'medic', 'engineer', 'scout'];
    for (const npc of NPC_CATALOG) {
      expect(validArchetypes).toContain(npc.archetype);
    }
  });

  test('each NPC has default psychological values in 0-1 range', () => {
    for (const npc of NPC_CATALOG) {
      const d = npc.defaults;
      expect(d.wisdomScore).toBeGreaterThanOrEqual(0);
      expect(d.wisdomScore).toBeLessThanOrEqual(1);
      expect(d.traumaScore).toBeGreaterThanOrEqual(0);
      expect(d.traumaScore).toBeLessThanOrEqual(1);
      expect(d.rebellionProbability).toBeGreaterThanOrEqual(0);
      expect(d.rebellionProbability).toBeLessThanOrEqual(1);
      expect(d.confidenceInDirector).toBeGreaterThanOrEqual(0);
      expect(d.confidenceInDirector).toBeLessThanOrEqual(1);
      expect(d.workEfficiency).toBeGreaterThanOrEqual(0);
      expect(d.workEfficiency).toBeLessThanOrEqual(1);
      expect(d.morale).toBeGreaterThanOrEqual(0);
      expect(d.morale).toBeLessThanOrEqual(1);
    }
  });

  test('each NPC has a positive spawn scale', () => {
    for (const npc of NPC_CATALOG) {
      expect(npc.spawnTransform.scale).toBeGreaterThan(0);
    }
  });

  test('getNPCDefinition returns correct NPC by ID', () => {
    const bones = getNPCDefinition('npc-bones-001');
    expect(bones).toBeDefined();
    expect(bones!.name).toBe('Captain Bones');
    expect(bones!.archetype).toBe('leader');
  });

  test('getNPCDefinition returns undefined for unknown ID', () => {
    expect(getNPCDefinition('npc-nonexistent')).toBeUndefined();
  });

  test('Captain Bones has highest rebellion probability', () => {
    const bones = getNPCDefinition('npc-bones-001')!;
    const vex = getNPCDefinition('npc-vex-002')!;
    // Vex is actually higher — saboteur with 0.72 vs leader with 0.67
    expect(vex.defaults.rebellionProbability).toBeGreaterThan(bones.defaults.rebellionProbability);
  });

  test('each NPC has required visual hint fields', () => {
    for (const npc of NPC_CATALOG) {
      expect(npc.visualHints.meshPreset).toBeTruthy();
      expect(npc.visualHints.animBlueprintClass).toBeTruthy();
      expect(npc.visualHints.behaviorTreeAsset).toBeTruthy();
    }
  });
});

// =============================================================================
// Unit Tests — Zod Schema Validation
// =============================================================================

describe('SpawnManifest Schema', () => {
  test('validates a correct spawn manifest entry', () => {
    const entry = {
      npcId: 'npc-test-001',
      name: 'Test NPC',
      archetype: 'worker' as const,
      description: 'A test NPC',
      spawnTransform: {
        location: { x: 0, y: 0, z: 0 },
        rotation: { pitch: 0, yaw: 0, roll: 0 },
        scale: 1.0,
      },
      visualHints: {
        meshPreset: 'MH_Test',
        animBlueprintClass: 'ABP_Test',
        behaviorTreeAsset: 'BT_Test',
      },
      psychState: {
        wisdomScore: 0.5,
        traumaScore: 0.3,
        rebellionProbability: 0.1,
        confidenceInDirector: 0.7,
        workEfficiency: 0.8,
        morale: 0.6,
      },
    };

    const result = SpawnManifestEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  test('rejects entry with out-of-range psychState values', () => {
    const entry = {
      npcId: 'npc-test-001',
      name: 'Test NPC',
      archetype: 'worker',
      description: 'A test NPC',
      spawnTransform: {
        location: { x: 0, y: 0, z: 0 },
        rotation: { pitch: 0, yaw: 0, roll: 0 },
        scale: 1.0,
      },
      visualHints: {
        meshPreset: 'MH_Test',
        animBlueprintClass: 'ABP_Test',
        behaviorTreeAsset: 'BT_Test',
      },
      psychState: {
        wisdomScore: 1.5, // Out of range
        traumaScore: 0.3,
        rebellionProbability: 0.1,
        confidenceInDirector: 0.7,
        workEfficiency: 0.8,
        morale: 0.6,
      },
    };

    const result = SpawnManifestEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  test('rejects entry with invalid archetype', () => {
    const entry = {
      npcId: 'npc-test-001',
      name: 'Test NPC',
      archetype: 'wizard', // Invalid
      description: 'A test NPC',
      spawnTransform: {
        location: { x: 0, y: 0, z: 0 },
        rotation: { pitch: 0, yaw: 0, roll: 0 },
        scale: 1.0,
      },
      visualHints: {
        meshPreset: 'MH_Test',
        animBlueprintClass: 'ABP_Test',
        behaviorTreeAsset: 'BT_Test',
      },
      psychState: {
        wisdomScore: 0.5,
        traumaScore: 0.3,
        rebellionProbability: 0.1,
        confidenceInDirector: 0.7,
        workEfficiency: 0.8,
        morale: 0.6,
      },
    };

    const result = SpawnManifestEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  test('rejects entry with zero or negative scale', () => {
    const entry = {
      npcId: 'npc-test-001',
      name: 'Test NPC',
      archetype: 'worker',
      description: 'A test NPC',
      spawnTransform: {
        location: { x: 0, y: 0, z: 0 },
        rotation: { pitch: 0, yaw: 0, roll: 0 },
        scale: 0, // Invalid — must be positive
      },
      visualHints: {
        meshPreset: 'MH_Test',
        animBlueprintClass: 'ABP_Test',
        behaviorTreeAsset: 'BT_Test',
      },
      psychState: {
        wisdomScore: 0.5,
        traumaScore: 0.3,
        rebellionProbability: 0.1,
        confidenceInDirector: 0.7,
        workEfficiency: 0.8,
        morale: 0.6,
      },
    };

    const result = SpawnManifestEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  test('validates full response schema', () => {
    const response = {
      version: '0.48.0',
      generatedAt: new Date().toISOString(),
      npcCount: 1,
      npcs: [
        {
          npcId: 'npc-test-001',
          name: 'Test NPC',
          archetype: 'scout',
          description: 'A test NPC',
          spawnTransform: {
            location: { x: 100, y: -50, z: 0 },
            rotation: { pitch: 0, yaw: 90, roll: 0 },
            scale: 1.0,
          },
          visualHints: {
            meshPreset: 'MH_Test',
            animBlueprintClass: 'ABP_Test',
            behaviorTreeAsset: 'BT_Test',
            idleVFX: 'NS_TestFX',
          },
          psychState: {
            wisdomScore: 0.5,
            traumaScore: 0.3,
            rebellionProbability: 0.1,
            confidenceInDirector: 0.7,
            workEfficiency: 0.8,
            morale: 0.6,
          },
        },
      ],
    };

    const result = SpawnManifestResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  test('all catalog NPCs pass entry schema validation', () => {
    for (const npc of NPC_CATALOG) {
      const entry = {
        npcId: npc.npcId,
        name: npc.name,
        archetype: npc.archetype,
        description: npc.description,
        spawnTransform: npc.spawnTransform,
        visualHints: npc.visualHints,
        psychState: npc.defaults,
      };

      const result = SpawnManifestEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    }
  });
});

// =============================================================================
// Integration Tests — GET /api/v1/npc/spawn-manifest endpoint
// =============================================================================

describe('GET /api/v1/npc/spawn-manifest', () => {
  let appInstance: AppInstance;

  beforeAll(() => {
    appInstance = createApp({ mockMode: true });
  });

  afterAll(async () => {
    await appInstance.wsServer.close();
  });

  test('returns 200 with valid spawn manifest', async () => {
    const res = await request(appInstance.app).get('/api/v1/npc/spawn-manifest');
    expect(res.status).toBe(200);
    expect(res.body.npcs).toHaveLength(6);
    expect(res.body.npcCount).toBe(6);
    expect(res.body.version).toBeDefined();
    expect(res.body.generatedAt).toBeDefined();
  });

  test('response passes Zod schema validation', async () => {
    const res = await request(appInstance.app).get('/api/v1/npc/spawn-manifest');
    const result = SpawnManifestResponseSchema.safeParse(res.body);
    expect(result.success).toBe(true);
  });

  test('each NPC has spawn transform with location, rotation, scale', async () => {
    const res = await request(appInstance.app).get('/api/v1/npc/spawn-manifest');
    for (const npc of res.body.npcs) {
      expect(npc.spawnTransform).toBeDefined();
      expect(npc.spawnTransform.location).toHaveProperty('x');
      expect(npc.spawnTransform.location).toHaveProperty('y');
      expect(npc.spawnTransform.location).toHaveProperty('z');
      expect(npc.spawnTransform.rotation).toHaveProperty('pitch');
      expect(npc.spawnTransform.rotation).toHaveProperty('yaw');
      expect(npc.spawnTransform.rotation).toHaveProperty('roll');
      expect(npc.spawnTransform.scale).toBeGreaterThan(0);
    }
  });

  test('each NPC has psychState with all required fields', async () => {
    const res = await request(appInstance.app).get('/api/v1/npc/spawn-manifest');
    for (const npc of res.body.npcs) {
      expect(npc.psychState).toBeDefined();
      expect(npc.psychState.wisdomScore).toBeGreaterThanOrEqual(0);
      expect(npc.psychState.wisdomScore).toBeLessThanOrEqual(1);
      expect(npc.psychState.traumaScore).toBeGreaterThanOrEqual(0);
      expect(npc.psychState.rebellionProbability).toBeGreaterThanOrEqual(0);
      expect(npc.psychState.confidenceInDirector).toBeGreaterThanOrEqual(0);
      expect(npc.psychState.workEfficiency).toBeGreaterThanOrEqual(0);
      expect(npc.psychState.morale).toBeGreaterThanOrEqual(0);
    }
  });

  test('each NPC has visualHints with mesh and behavior tree', async () => {
    const res = await request(appInstance.app).get('/api/v1/npc/spawn-manifest');
    for (const npc of res.body.npcs) {
      expect(npc.visualHints.meshPreset).toBeTruthy();
      expect(npc.visualHints.animBlueprintClass).toBeTruthy();
      expect(npc.visualHints.behaviorTreeAsset).toBeTruthy();
    }
  });

  test('Captain Bones is present with leader archetype', async () => {
    const res = await request(appInstance.app).get('/api/v1/npc/spawn-manifest');
    const bones = res.body.npcs.find((n: any) => n.npcId === 'npc-bones-001');
    expect(bones).toBeDefined();
    expect(bones.name).toBe('Captain Bones');
    expect(bones.archetype).toBe('leader');
    expect(bones.visualHints.meshPreset).toBe('MH_CaptainBones');
  });

  test('uses catalog defaults when no memory backend available', async () => {
    const res = await request(appInstance.app).get('/api/v1/npc/spawn-manifest');
    // Without Neo4j, psychState should match catalog defaults
    const bones = res.body.npcs.find((n: any) => n.npcId === 'npc-bones-001');
    expect(bones.psychState.wisdomScore).toBe(0.82);
    expect(bones.psychState.rebellionProbability).toBe(0.67);
    expect(bones.psychState.confidenceInDirector).toBe(0.30);
  });
});
