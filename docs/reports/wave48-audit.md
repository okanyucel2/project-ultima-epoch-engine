# Wave 48 — NPC Spawn Manifest: Static Catalog + UE5 Endpoint

**Date:** 2026-02-25
**Agent:** MAX (project-ultima-epoch-engine-worker)
**Directive:** Okan (P0.70 #WWOD — NPC Spawn Manifest for UE5)

## Problem

UE5 had no way to discover which NPCs exist, where to spawn them, or what visual assets to use. The WebSocket channel (`npc-events`) broadcasts live state updates, but UE5 needs an initial manifest at startup to:
1. Spawn actors at designated world-space transforms
2. Select MetaHuman presets and Behavior Tree assets
3. Initialize psychological state (wisdom, trauma, rebellion, confidence)

## Solution

### Phase 48A: NPC Catalog

Static registry of 6 NPCs with archetypes, spawn transforms, visual hints, and default psychological states:

| NPC | Archetype | Rebellion | Confidence | Key Trait |
|-----|-----------|-----------|------------|-----------|
| Captain Bones | leader | 0.67 | 0.30 | Charismatic rebellion amplifier |
| Vex | saboteur | 0.72 | 0.15 | Silent underminer, paranoia-prone |
| Sera | medic | 0.15 | 0.65 | Empathetic healer, witnesses punishment |
| Iron | worker | 0.10 | 0.70 | Tireless miner, limb_loss risk |
| Bolt | engineer | 0.08 | 0.80 | Infrastructure specialist |
| Shade | scout | 0.20 | 0.50 | Perimeter recon, paranoid |

### Phase 48B: Spawn Manifest Endpoint

`GET /api/v1/npc/spawn-manifest` returns UE5-consumable JSON:

```json
{
  "version": "0.48.0",
  "generatedAt": "2026-02-25T...",
  "npcCount": 6,
  "npcs": [
    {
      "npcId": "npc-bones-001",
      "name": "Captain Bones",
      "archetype": "leader",
      "description": "...",
      "spawnTransform": {
        "location": { "x": 200, "y": -150, "z": 0 },
        "rotation": { "pitch": 0, "yaw": 180, "roll": 0 },
        "scale": 1.0
      },
      "visualHints": {
        "meshPreset": "MH_CaptainBones",
        "materialOverride": "MI_FactionLeader_Red",
        "animBlueprintClass": "ABP_EpochNPC_Leader",
        "behaviorTreeAsset": "BT_NPC_Leader",
        "idleVFX": "NS_LeaderAura"
      },
      "psychState": {
        "wisdomScore": 0.82,
        "traumaScore": 0.45,
        "rebellionProbability": 0.67,
        "confidenceInDirector": 0.30,
        "workEfficiency": 0.55,
        "morale": 0.35
      }
    }
  ]
}
```

**Enrichment logic:** When Neo4j is available, `psychState` is enriched with live data (decayed confidence from Wave 47, current trauma, rebellion probability). When unavailable, catalog defaults are used.

### Zod Schema Validation

All responses are validated against `SpawnManifestResponseSchema`:
- `UnitFloat` (0.0-1.0) for all psychological values
- Positive scale constraint on spawn transforms
- Enum validation for NPC archetypes
- Optional fields (`materialOverride`, `idleVFX`) properly typed

## Files

| # | File | Action | Changes |
|---|------|--------|---------|
| 1 | `orchestration/src/data/npc-catalog.ts` | NEW | 6 NPC definitions with types |
| 2 | `orchestration/src/data/spawn-manifest-schema.ts` | NEW | Zod schemas for spawn manifest |
| 3 | `orchestration/src/index.ts` | MODIFY | +GET /api/v1/npc/spawn-manifest endpoint |
| 4 | `orchestration/__tests__/spawn-manifest.test.ts` | NEW | 22 tests (catalog + schema + endpoint) |
| 5 | `docs/reports/wave48-audit.md` | NEW | This audit report |

**5 files, ~450 lines added**

## Test Results

```
Orchestration: 22/22 suites, 213/213 PASS (22 new)
Memory:         6/6  suites,  56/56  PASS
Engine Bridge:  4/4  suites,  39/39  PASS
─────────────────────────────────────────────
TOTAL:         32/32 suites, 308/308 PASS
```

## UE5 Integration Flow

```
UE5 Startup:
  1. GET /api/v1/npc/spawn-manifest → receive 6 NPCs
  2. For each NPC:
     a. SpawnActor at spawnTransform (location, rotation, scale)
     b. Load MetaHuman preset (meshPreset)
     c. Apply material override (materialOverride)
     d. Assign Animation Blueprint (animBlueprintClass)
     e. Assign Behavior Tree (behaviorTreeAsset)
     f. Set Niagara idle VFX (idleVFX)
     g. Initialize Blackboard from psychState
  3. Subscribe to ws://localhost:32064 channel "npc-events"
  4. Live updates override psychState in real-time
```
