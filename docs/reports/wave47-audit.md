# Wave 47 — Epoch Memory: Confidence Edge + Hyperbolic Decay

**Date:** 2026-02-25
**Agent:** MAX (project-ultima-epoch-engine-worker)
**Directive:** Okan (P0.70 #WWOD — Kin güden Epoch Memory)

## Problem

Confidence Edge and Hyperbolic Decay existed as isolated modules — TRUSTS edges stored raw confidence values, and time decay was only applied to trauma scores. Three critical gaps:

1. **Frozen trust**: `getConfidence()` returned the raw stored value. An NPC that trusted the Director at 0.9 two weeks ago still showed 0.9 — no decay toward neutral.
2. **Trust blind to rebellion**: `getRebellionRisk()` only used trauma. An NPC with 0.05 confidence in the Director had identical rebellion probability to one with 0.95 confidence.
3. **No auto-update**: Recording a REWARD/PUNISHMENT event didn't touch the TRUSTS edge. Confidence was a dead letter unless explicitly set.

## Solution

### Phase 47A: Confidence Edge Injection

**Hyperbolic decay toward neutral (0.5), not toward zero:**

```
decayedConfidence = 0.5 + (rawConfidence - 0.5) × (1 / (1 + α × hours))
```

| Property | Behavior |
|----------|----------|
| High trust (0.9) | Decays toward 0.5 over time (forgotten loyalty) |
| Low trust (0.1) | Rises toward 0.5 over time (forgotten grudge) |
| Neutral (0.5) | Unaffected by any amount of time |
| Never crosses | High stays ≥ 0.5, low stays ≤ 0.5 |
| Asymptotic | Never reaches exactly neutral (NPC always remembers) |

**Auto-Director confidence update**: `recordEvent()` now auto-updates the Director TRUSTS edge for player actions (reward, punishment, command, dialogue).

**Rebellion risk now includes trust**:
```
probability = base(0.05) + trauma×0.6 + (1-decayedConfidence)×0.25
```

### Phase 47B: CognitiveRails Trust Erosion

**Rail 5: Trust Erosion** — soft warning when Director trust drops critically:
- `< 0.15` → CRITICAL: "NPC deeply distrustful. Rebellion amplifier active."
- `< 0.25` → WARNING: "Trust severely eroded."

Evaluation order: Rebellion → AEGIS → Coherence → **Trust Erosion** → Latency

## Files

| # | File | Action | Changes |
|---|------|--------|---------|
| 1 | `shared/types/memory.ts` | MODIFY | +DecayedConfidence interface, CONFIDENCE_NEUTRAL |
| 2 | `memory/src/graph/confidence-edge.ts` | MODIFY | +getDecayedConfidence(), +getDecayedConfidenceRelations(), +applyConfidenceDecay() |
| 3 | `memory/src/epoch-memory-service.ts` | MODIFY | +auto Director confidence update, +confidence in rebellion risk, +getDecayedConfidence() |
| 4 | `memory/src/index.ts` | MODIFY | +applyConfidenceDecay export |
| 5 | `memory/jest.config.js` | MODIFY | +moduleNameMapper for @epoch/shared/* |
| 6 | `orchestration/src/services/memory-integration.ts` | MODIFY | +getDecayedConfidence on IMemoryBackend, getNPCContext uses decayed confidence |
| 7 | `orchestration/src/neural-mesh/cognitive-rails.ts` | MODIFY | +Rail 5: checkTrustErosion(), evaluateAll includes confidenceInDirector |
| 8 | `memory/__tests__/confidence-decay.test.ts` | NEW | 24 tests (pure decay, decayed confidence, relations, auto-update) |
| 9 | `orchestration/__tests__/cognitive-rails.test.ts` | MODIFY | +8 tests (trust erosion rail, boundary values, integration) |
| 10 | `orchestration/__tests__/memory-integration.test.ts` | MODIFY | +getDecayedConfidence mock |

**10 files, ~250 lines added**

## Test Results

```
Memory:        6/6  suites, 56/56   PASS (24 new)
Orchestration: 21/21 suites, 191/191 PASS (8 new)
Engine Bridge: 4/4  suites, 39/39   PASS
TypeScript:    Clean compilation (0 errors)
─────────────────────────────────────────────
TOTAL:         31/31 suites, 286/286 PASS
```

## Before/After

| Aspect | Before | After (Wave 47) |
|--------|--------|-----------------|
| Confidence decay | ❌ Frozen (raw value returned) | ✅ Hyperbolic decay toward neutral (0.5) |
| Rebellion risk | Trauma only (base + trauma×0.6) | ✅ + confidence factor ((1-trust)×0.25) |
| Director trust auto-update | ❌ Must call setConfidence manually | ✅ Auto-updated on every player action |
| CognitiveRails trust check | ❌ No trust awareness | ✅ Rail 5: Trust Erosion (CRITICAL/WARNING) |
| Memory jest config | ❌ Module resolution broken | ✅ @epoch/shared/* mapped correctly |

## Mathematical Properties

```
applyConfidenceDecay(0.9, α=0.1, t=0h)   = 0.900  (no decay)
applyConfidenceDecay(0.9, α=0.1, t=10h)  = 0.700  (loyalty fading)
applyConfidenceDecay(0.9, α=0.1, t=100h) = 0.536  (near neutral)
applyConfidenceDecay(0.9, α=0.1, t=∞)    → 0.500  (forgotten but never erased)

applyConfidenceDecay(0.1, α=0.1, t=0h)   = 0.100  (deep distrust)
applyConfidenceDecay(0.1, α=0.1, t=10h)  = 0.300  (grudge weakening)
applyConfidenceDecay(0.1, α=0.1, t=100h) = 0.464  (near neutral)
applyConfidenceDecay(0.1, α=0.1, t=∞)    → 0.500  (forgotten but never erased)
```
