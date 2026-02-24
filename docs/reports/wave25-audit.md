# Wave 25 Audit Report — Season 2 Opening

**Date:** 2026-02-24
**Agent:** MAX (project-ultima-epoch-engine-worker)
**Wave:** 25 — Watchdog Optimization, Live Telemetry, Phoenix Protocol

---

## Summary

Wave 25 closes three operational gaps left by Waves 15-24:

1. **Slow detection** (30s -> 15s) — Watchdog interval halved, now honors per-service `genesis.yaml` intervals
2. **No live visibility** — Watchdog restarts broadcast via HTTP -> WebSocket -> Dashboard pipeline
3. **Data loss on shutdown** — `RetryQueue.drainAndStop()` + `ConnectionPool` drain-before-close + graceful Neo4j shutdown

---

## Phase 25A: Watchdog Interval Optimization

### Changes

| File | Change |
|------|--------|
| `genesis.yaml` | `interval: 30` -> `interval: 15` on all 3 services (lines 65, 79, 92) |
| `scripts/genesis_process.sh` (parent) | `DEFAULT_CHECK_INTERVAL=30` -> `15` (line 1890) |
| `scripts/genesis_process.sh` (parent) | Dynamic min-interval sleep: reads `genesis.yaml` per project, sleeps at fastest service's interval |

### Verification Notes

- The per-service `interval` in `genesis.yaml` was parsed but the main loop always used `DEFAULT_CHECK_INTERVAL=30`
- Now the loop computes `min(intervals)` across all monitored projects' `genesis.yaml` files
- Fallback: if YAML parsing fails, uses `DEFAULT_CHECK_INTERVAL` (15)

---

## Phase 25B: Live Telemetry & Dashboard Broadcast

### Pipeline

```
Watchdog (bash) --curl--> /api/telemetry/watchdog (Express)
    --> wsServer.broadcast('system-status', data)
        --> Dashboard WebSocket listener
            --> useWatchdogTelemetry composable
                --> SystemHealthView pulse-glow + event log
```

### Changes

| File | Change |
|------|--------|
| `scripts/genesis_process.sh` | Added `watchdog_broadcast_restart()` function (~20 lines) — POSTs JSON to orchestration's telemetry endpoint after every successful restart |
| `orchestration/src/index.ts` | Added `POST /api/telemetry/watchdog` endpoint — receives watchdog payloads and rebroadcasts via WebSocket |
| `orchestration/src/index.ts` | Added startup broadcast in `app.listen()` callback — sends `type: 'startup'` event with version, port, wsPort |
| `dashboard/src/composables/useWatchdogTelemetry.ts` | NEW (~50 lines) — Subscribes to `system-status` channel, tracks `WatchdogEvent[]`, exposes `events` and `lastRestart` |
| `dashboard/src/views/SystemHealthView.vue` | Added pulse-glow animation on `service-card--restarting` class (5s duration, amber glow) |
| `dashboard/src/views/SystemHealthView.vue` | Added "Recent Events" card showing last 10 watchdog events with type tags and timestamps |
| `scripts/chaos_monkey.sh` | Added Phase 4 "Telemetry Verification" — validates telemetry endpoint responsiveness and WS broadcast path after chaos recovery |

### Composable API

```typescript
const { events, lastRestart } = useWatchdogTelemetry();
// events: readonly Ref<WatchdogEvent[]>  (max 50, newest first)
// lastRestart: readonly Ref<WatchdogEvent | null>
```

---

## Phase 25C: Phoenix Protocol Foundation

### Zero-Data-Loss Shutdown Chain

```
gracefulShutdown(signal)
  -> broadcast 'shutdown' event via WS
  -> memoryIntegration.close()
     -> Neo4jMemoryBackend.close()
        -> (internal) driver.close()
  -> wsServer.close()
  -> server.close()
```

For the ConnectionPool path (used when pool-managed connections exist):
```
ConnectionPool.close()
  -> retryQueue.drainAndStop(session)
     -> stopAutoFlush()
     -> flush(session)  // writes all pending ops to Neo4j
  -> close all active sessions
  -> driver.close()
```

### Changes

| File | Change |
|------|--------|
| `memory/src/graph/retry-queue.ts` | Added `drainAndStop(session)` method — stops auto-flush timer then flushes all remaining ops |
| `memory/src/graph/connection-pool.ts` | Modified `close()` — drains RetryQueue before closing driver (logs drained count) |
| `orchestration/src/services/memory-integration.ts` | Added `close()` and `drain()` methods — delegate to backend's close |
| `orchestration/src/index.ts` | Modified `gracefulShutdown()` — broadcasts shutdown event, closes Neo4j pool before WS |
| `orchestration/src/index.ts` | Added `POST /api/phoenix/drain` endpoint — triggers RetryQueue drain for pre-restart use |
| `scripts/phoenix_protocol.sh` | NEW (~280 lines) — 5-phase autonomous recovery: Diagnose -> Drain -> Restart -> Verify -> Log |

### Phoenix Protocol Phases

1. **DIAGNOSE** — Checks all 4 service ports + Neo4j container health + deep health endpoint
2. **DRAIN** — Hits `/api/phoenix/drain` to flush RetryQueue (if orchestration alive)
3. **RESTART** — Ordered: Neo4j first, then Logistics, then Orchestration, then Dashboard
4. **VERIFY** — Deep health check all services, verify Neo4j connectivity
5. **LOG** — Appends recovery event to `docs/reports/phoenix-recovery-log.md`

---

## Test Results

```
engine-bridge tests: 39/39 PASSED
orchestration tsc:   CLEAN (0 errors)
dashboard vue-tsc:   CLEAN (0 errors)
memory tsc:          1 pre-existing error (neo4j namespace in npc-memory.ts — unrelated to Wave 25)
```

---

## File Inventory

| # | File | Action | Lines Changed |
|---|------|--------|---------------|
| 1 | `genesis.yaml` | MODIFIED | 3 (interval values) |
| 2 | `scripts/genesis_process.sh` (parent) | MODIFIED | +40 (interval logic + broadcast fn) |
| 3 | `orchestration/src/index.ts` | MODIFIED | +35 (startup broadcast + shutdown + endpoints) |
| 4 | `memory/src/graph/retry-queue.ts` | MODIFIED | +10 (drainAndStop) |
| 5 | `memory/src/graph/connection-pool.ts` | MODIFIED | +15 (drain-before-close) |
| 6 | `orchestration/src/services/memory-integration.ts` | MODIFIED | +25 (close + drain methods) |
| 7 | `dashboard/src/composables/useWatchdogTelemetry.ts` | NEW | ~50 |
| 8 | `dashboard/src/views/SystemHealthView.vue` | MODIFIED | +80 (pulse-glow + events + CSS) |
| 9 | `scripts/phoenix_protocol.sh` | NEW | ~280 |
| 10 | `scripts/chaos_monkey.sh` | MODIFIED | +45 (telemetry verification + report) |

**Total: ~580 lines across 10 files**

---

## Verification Checklist

- [x] `genesis.yaml` — All 3 services at `interval: 15`
- [x] `genesis_process.sh` — `DEFAULT_CHECK_INTERVAL=15` + dynamic min-interval sleep
- [x] `watchdog_broadcast_restart()` — POSTs to `/api/telemetry/watchdog` after restart
- [x] `/api/telemetry/watchdog` — Receives + rebroadcasts via WebSocket
- [x] Startup broadcast — `system-status` event with version/port on listen
- [x] Shutdown broadcast — `system-status` event with signal before close
- [x] `RetryQueue.drainAndStop()` — Flush then stop timer
- [x] `ConnectionPool.close()` — Drain before driver close
- [x] `MemoryIntegration.close()` / `drain()` — Delegation methods
- [x] `gracefulShutdown()` — Neo4j close before WS close
- [x] `/api/phoenix/drain` — Pre-restart drain endpoint
- [x] `phoenix_protocol.sh` — 5-phase autonomous recovery
- [x] `chaos_monkey.sh` — Phase 4 telemetry verification
- [x] `useWatchdogTelemetry.ts` — Composable with reactive events
- [x] `SystemHealthView.vue` — Pulse-glow + Recent Events card
- [x] All 39 engine-bridge tests pass
- [x] TypeScript compilation clean (orchestration + dashboard)
