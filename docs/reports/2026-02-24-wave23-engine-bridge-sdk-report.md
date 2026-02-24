# Wave 23 Audit Report — @epoch/engine-bridge SDK

**Date:** 2026-02-24
**Agent:** project-ultima-epoch-engine-worker
**Status:** COMPLETE — All 3 phases implemented and verified
**P0.70 (#WWOD):** Total Capability — no prototyping, full adapter layer

---

## Architecture

```
             ┌──────────────────────────────────────────────┐
             │         @epoch/engine-bridge SDK             │
             │                                              │
  WebSocket  │  ┌─────────────┐    ┌──────────────────┐    │
  :32064 ──→ │  │   Zod       │    │   Dispatcher      │    │
  (JSON)     │  │  Schemas    │──→ │  (validates +     │    │
             │  │  (5 channels)│    │   routes events)  │    │
             │  └─────────────┘    └────────┬───────────┘    │
             │                              │                │
             │                    ┌─────────┴─────────┐      │
             │                    │                   │      │
             │            ┌───────┴──────┐   ┌────────┴────┐ │
             │            │ GodotExporter│   │ UE5Exporter │ │
             │            │              │   │             │ │
             │            │ • Signals    │   │ • FStructs  │ │
             │            │ • AnimTree   │   │ • Blackboard│ │
             │            │ • NodeProps  │   │ • MetaHuman │ │
             │            │ • ShaderArgs │   │ • Niagara   │ │
             │            └──────────────┘   └─────────────┘ │
             └──────────────────────────────────────────────┘
                        ↓                       ↓
                   Godot 4.x               Unreal Engine 5
                  (GDScript)               (C++ / Blueprints)
```

Game engines are **dumb clients** — all intelligence stays in the adapter.

---

## Phase 23A: Core SDK

### Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `packages/engine-bridge/package.json` | 25 | Package config (zod, ws deps) |
| `packages/engine-bridge/tsconfig.json` | 24 | Composite TS project |
| `packages/engine-bridge/jest.config.js` | 31 | Test config |
| `src/schemas/common.ts` | 53 | Base types: envelopes, enums, UnitFloat |
| `src/schemas/npc-events.ts` | 21 | NPCEvent schema (all stats) |
| `src/schemas/simulation-ticks.ts` | 42 | SimulationTick (resources, infestation) |
| `src/schemas/rebellion-alerts.ts` | 22 | RebellionAlert schema |
| `src/schemas/telemetry.ts` | 53 | TelemetryEvent (breakdown, trauma, state change) |
| `src/schemas/index.ts` | 10 | Schema barrel export |
| `src/dispatcher.ts` | 188 | Core dispatcher with Zod validation |
| `src/exporters/base-exporter.ts` | 63 | Abstract exporter interface |
| `src/index.ts` | 42 | Package barrel export |

### Key Design Decisions

- **Zod over io-ts/runtypes**: Already used in memory package, consistent across project
- **Channel-schema registry**: New channels just add a schema entry — zero dispatcher changes
- **processMessage() is public**: Enables injection from any source (WS, file, test)
- **WebSocket connect() takes implementation**: Works with Node.js `ws`, browser WebSocket, or Godot native

---

## Phase 23B: Godot Exporter

| File | Lines | Purpose |
|------|-------|---------|
| `src/exporters/godot-exporter.ts` | 253 | Full Godot adapter |

### Output Format: GodotFrame

| Field | Type | Godot Usage |
|-------|------|-------------|
| `signals` | `GodotSignal[]` | `emit_signal()` calls |
| `animationParams` | `Record<npcId, GodotAnimationParams>` | AnimationTree parameter maps |
| `nodeUpdates` | `GodotNodeUpdate[]` | Node property batch writes |
| `timestamp` | `string` | Event time |

### AnimationTree Derivation

| Condition | State |
|-----------|-------|
| `status === 'rebelling'` or `rebellion > 0.80` | `rebel` |
| `rebellion > 0.35` | `agitated` |
| `status === 'idle'` | `idle` |
| Default | `walk` |

### BlendSpace2D

- **X axis (agitation)**: `rebellionProbability + (1 - confidence) * 0.3`
- **Y axis (fatigue)**: `traumaScore * 0.7 + (1 - workEfficiency) * 0.3`

### Color System

Reuses the dashboard heatmap gradient for shader parameters:
- Green (#22c55e) → Amber (#f59e0b) → Red (#dc2626)

---

## Phase 23C: UE5 MetaHuman Exporter

| File | Lines | Purpose |
|------|-------|---------|
| `src/exporters/ue5-exporter.ts` | 314 | Full UE5 adapter |

### Output Format: UE5Frame

| Field | Type | UE5 Usage |
|-------|------|-----------|
| `structs` | `FEpochNPCState[]` | USTRUCT deserialization |
| `blackboards` | `BehaviorTreeBlackboard[]` | BT Blackboard key writes |
| `faceStates` | `MetaHumanFaceState[]` | MetaHuman morph targets + emotion curves |
| `vfxTriggers` | `NiagaraTrigger[]` | Niagara system activate/deactivate/burst |
| `materialParams` | `MaterialParameterUpdate[]` | Dynamic material instances |

### MetaHuman Face Derivation

14 ARKit-compatible morph targets driven by NPC psychological state:

| Morph Target | Driver |
|--------------|--------|
| `browDownLeft/Right` | `rebellion * 0.8 + trauma * 0.3` |
| `eyeSquintLeft/Right` | Active when `rebellion > 0.5` |
| `eyeWideLeft/Right` | Active when `trauma > 0.7` |
| `mouthFrownLeft/Right` | `(1 - morale) * 0.8` |
| `jawOpen` | Active when `rebellion > VETO_THRESHOLD` |
| `noseSneerLeft/Right` | Active when `rebellion > 0.6` |

5 emotion curves: Anger, Fear, Sadness, Contempt, Neutral

### Mental Breakdown Face Profiles

Each breakdown type has unique morph target profile:
- **rage_episode**: Max brow down, squint, jaw open, nose sneer
- **paranoia_onset**: Wide eyes, brow up
- **dissociation**: Minimal expression (blank stare)
- **psychological_fracture**: Asymmetric eyes, brow up, jaw open

### Niagara VFX Systems

| System | Trigger |
|--------|---------|
| `NS_RebellionAura` | NPC rebellion > HALT |
| `NS_AEGISContainment` | AEGIS veto fired |
| `NS_PsychFracture` | Mental breakdown event |
| `NS_TraumaScar` | Permanent trauma inflicted |
| `NS_PlagueHeart` | Infestation plague active |
| `NS_RebellionPassive/Active/Collective` | Rebellion by type |

---

## Verification

### TypeScript
```
$ tsc --noEmit
(clean — zero errors)
```

### Tests
```
PASS __tests__/schemas.test.ts         (14 tests)
PASS __tests__/dispatcher.test.ts      (7 tests)
PASS __tests__/godot-exporter.test.ts  (9 tests)
PASS __tests__/ue5-exporter.test.ts    (9 tests)

Test Suites: 4 passed, 4 total
Tests:       39 passed, 39 total
```

---

## File Summary

| # | File | Action | Lines |
|---|------|--------|-------|
| 1 | `packages/engine-bridge/package.json` | NEW | 25 |
| 2 | `packages/engine-bridge/tsconfig.json` | NEW | 24 |
| 3 | `packages/engine-bridge/jest.config.js` | NEW | 31 |
| 4 | `src/schemas/common.ts` | NEW | 53 |
| 5 | `src/schemas/npc-events.ts` | NEW | 21 |
| 6 | `src/schemas/simulation-ticks.ts` | NEW | 42 |
| 7 | `src/schemas/rebellion-alerts.ts` | NEW | 22 |
| 8 | `src/schemas/telemetry.ts` | NEW | 53 |
| 9 | `src/schemas/index.ts` | NEW | 10 |
| 10 | `src/dispatcher.ts` | NEW | 188 |
| 11 | `src/exporters/base-exporter.ts` | NEW | 63 |
| 12 | `src/exporters/godot-exporter.ts` | NEW | 253 |
| 13 | `src/exporters/ue5-exporter.ts` | NEW | 314 |
| 14 | `src/index.ts` | NEW | 42 |
| 15 | `__tests__/schemas.test.ts` | NEW | 143 |
| 16 | `__tests__/dispatcher.test.ts` | NEW | 108 |
| 17 | `__tests__/godot-exporter.test.ts` | NEW | 147 |
| 18 | `__tests__/ue5-exporter.test.ts` | NEW | 183 |
| 19 | `tsconfig.json` (root) | MODIFIED | +1 ref |
| **Total** | | | **~1722** |
