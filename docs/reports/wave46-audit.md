# Wave 46 — Doomsday Pipeline Integration & Zero-Bypass Protocol

**Date:** 2026-02-25
**Agent:** MAX (project-ultima-epoch-engine-worker)
**Directive:** Okan (P0.70 #WWOD — MVP reddedildi)

## Problem

The Doomsday scenario (Wave 24A) bypassed the entire Neural Mesh pipeline:

```
run-doomsday.ts → EpochDispatcher.processMessage() → Exporters
                  ❌ No EventClassifier
                  ❌ No TierRouter
                  ❌ No CognitiveRails
                  ❌ No AEGIS Veto
                  ❌ No Neo4j persistence
                  ❌ rebellion-alerts were HARDCODED (vetoedByAegis: true, line 282)
```

This was a "bridge script" — exactly the MVP trap P0.70 forbids.

## Solution

### Phase 46A: Core Routing Integration

**New architecture:**

```
DoomsdayOrchestrator → NeuralMeshCoordinator.processEvent()
  ├─ simulation-ticks → AEGIS infestation update + WS broadcast
  ├─ npc-events       → EventClassifier → TierRouter → LLM → CognitiveRails → AEGIS → Neo4j
  ├─ telemetry        → Neo4j persist + WS broadcast
  └─ rebellion-alerts → REJECTED (must be computed by CognitiveRails)
```

**Key design decisions:**
1. rebellion-alerts are NEVER accepted as input — they are OUTPUTS computed organically
2. NPC events with rebellionProbability >= 0.80 auto-escalate to `rebellion_analysis` (STRATEGIC tier)
3. NPCs with rebellionProbability >= 0.50 or traumaScore >= 0.70 escalate to `psychology_synthesis`
4. simulation-ticks update AEGIS infestation context before NPC events are evaluated
5. Telemetry events (breakdowns, trauma) are persisted to Neo4j and broadcast to dashboard

### Phase 46B: Zero-Bypass Protocol

18 tests verifying:
- rebellion-alerts channel rejected as direct input
- Unknown channels rejected
- Every NPC event classified, routed, rails-checked
- AEGIS infestation level updates from simulation ticks
- High rebellion NPC triggers organic veto (CognitiveRails Rail 1)
- Simulation ticks broadcast to WebSocket
- NPC events persisted to Neo4j
- Telemetry events persisted to Neo4j
- Permanent trauma events persisted to Neo4j
- Full 5-phase doomsday completes without errors
- Organic vetoes fire for Captain Bones (0.92) and Vex (0.85)
- Infestation level progresses: 42 → 65 → 85
- Zero data loss — all events persisted
- Catastrophic events reach system-status channel
- Injected rebellion-alerts are rejected even mixed with valid events

## Files

| # | File | Action | Lines |
|---|------|--------|-------|
| 1 | `orchestration/src/scenarios/doomsday-orchestrator.ts` | NEW | ~260 |
| 2 | `orchestration/src/index.ts` | MODIFY | +35 (imports, AEGIS supervisor, endpoint) |
| 3 | `packages/engine-bridge/scripts/run-doomsday-pipeline.ts` | NEW | ~280 |
| 4 | `packages/engine-bridge/scripts/run-doomsday.ts` | MODIFY | Header marked LEGACY |
| 5 | `packages/engine-bridge/package.json` | MODIFY | +2 scripts |
| 6 | `orchestration/__tests__/doomsday-pipeline.test.ts` | NEW | ~450 |

**6 files, ~1030 lines**

## Test Results

```
Orchestration: 183/183 PASS (21 suites, includes 18 new doomsday tests)
Engine Bridge:  39/39  PASS (4 suites)
TypeScript:     Clean compilation (0 errors)
```

## Before/After

| Aspect | Before (Wave 24A) | After (Wave 46) |
|--------|-------------------|-----------------|
| EventClassifier | ❌ Bypassed | ✅ Every NPC event classified |
| TierRouter | ❌ Bypassed | ✅ AI model selected per tier |
| CognitiveRails | ❌ Bypassed | ✅ 4 rails checked per event |
| AEGIS Veto | ❌ Hardcoded flag | ✅ Computed organically |
| Neo4j | ❌ No persistence | ✅ Fire-and-forget per event |
| rebellion-alerts | ❌ Injected as input | ✅ Computed as output by pipeline |
| Infestation tracking | ❌ Static in payload | ✅ AEGIS supervisor updated per tick |
