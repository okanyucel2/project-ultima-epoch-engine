# Phase 16B: Process Manager Audit Log

**Date:** 2026-02-24
**Scope:** Crash restart policy for all 3 Epoch Engine services
**Status:** IMPLEMENTED + VERIFIED

---

## 1. Pre-Audit Findings

### Architecture Reviewed
- `scripts/genesis_process.sh` (1509 lines) — Process Manager v2.0
- `scripts/pm.sh` (1034 lines) — CLI wrapper
- `scripts/crash_watchdog.sh` (183 lines) — Legacy crash archiver
- `/tmp/genesis_process_registry.json` — Process state persistence

### Critical Gaps Identified

| Gap | Severity | Description |
|-----|----------|-------------|
| No auto-restart | CRITICAL | Registry tracks PIDs but never restarts dead processes |
| No health polling | HIGH | Health checked only at startup, never again |
| No memory monitoring | HIGH | No RSS threshold detection for memory leaks |
| Stale registry | MEDIUM | Dead PIDs remain as "running" indefinitely |
| No restart budget | MEDIUM | No protection against restart loops |

### What Already Worked
- PID tracking via registry (read/write JSON)
- Health verification at startup (5 attempts)
- Graceful shutdown with SIGTERM + SIGKILL fallback
- Lock file for concurrent restart prevention
- Session Guard (P0.99) provides manual verification

---

## 2. Implementation

### 2a. genesis.yaml — Restart Policy Configuration

Added per-service restart policies and health check intervals:

```yaml
restart_policy:              # Global defaults
  max_restarts: 5            # Max restarts within window
  restart_window: 300        # 5-minute sliding window
  restart_delay: 3           # Seconds before restart attempt
  memory_limit_mb: 512       # RSS threshold

services:
  backend:                   # Orchestration (Node.js)
    health_check:
      interval: 30           # Watchdog check frequency
      timeout: 5             # Per-check timeout
      max_failures: 3        # Consecutive failures before restart
    restart_policy:
      max_restarts: 5
      memory_limit_mb: 512

  logistics:                 # Go backend
    restart_policy:
      max_restarts: 5
      memory_limit_mb: 256

  frontend:                  # Vue 3 dashboard
    restart_policy:
      max_restarts: 3
      memory_limit_mb: 256
```

### 2b. genesis_process.sh — Watchdog Daemon

Added `cmd_watchdog` function (~300 lines) with three monitoring layers:

**Layer 1: PID Monitoring**
- Reads PIDs from registry
- `kill -0 $pid` to verify process alive
- If dead: auto-restart via `restart_single_service()`

**Layer 2: Health Endpoint Polling**
- Curls health URL every `interval` seconds
- Tracks consecutive failures per service
- After `max_failures` consecutive failures: restart service
- Resets counter on recovery (logs "recovered after N failures")

**Layer 3: Memory Threshold**
- Reads RSS via `ps -o rss= -p $pid`
- Compares against `memory_limit_mb` from genesis.yaml
- If exceeded: restart service (reclaim leaked memory)

**Restart Budget (Loop Protection)**
- Per-service tracking: `{count}|{first_restart_timestamp}`
- Sliding window: resets after `restart_window` seconds
- Hard cap: stops restarting after `max_restarts` within window
- Logs "exceeded max restarts, giving up" on budget exhaustion

**Helper: `restart_single_service()`**
- Restarts one service without touching others
- Reads start command from genesis.yaml config
- SIGTERM old process, kill port occupant, start fresh
- Updates registry with new PID

### 2c. pm.sh — Watchdog CLI

```bash
pm.sh watchdog start [slug]   # Start daemon (auto-detects project from CWD)
pm.sh watchdog status          # Show daemon status
pm.sh watchdog stop            # Stop daemon
pm.sh watchdog --help          # Help text
```

### 2d. State Files

| File | Purpose |
|------|---------|
| `/tmp/genesis_watchdog.pid` | Daemon PID for lifecycle management |
| `/tmp/genesis_watchdog.log` | All watchdog actions (timestamped) |
| `/tmp/genesis_watchdog_state.json` | Machine-readable status (cycles, restarts) |

---

## 3. Service-Specific Restart Policies

| Service | Start Command | Health URL | Max Restarts | Memory Limit |
|---------|--------------|------------|-------------|-------------|
| Orchestration (backend) | `cd orchestration && npm run dev` | `http://localhost:12064/health` | 5 in 5min | 512 MB |
| Logistics | `cd logistics && go run cmd/server/main.go` | `http://localhost:12065/health` | 5 in 5min | 256 MB |
| Dashboard (frontend) | `cd dashboard && npm run dev` | `http://localhost:22064/` | 3 in 5min | 256 MB |

**Rationale:**
- Orchestration gets higher memory limit (512 MB) due to LLM adapter state, WebSocket connections, and Neo4j driver pools
- Logistics (Go) is memory-efficient by nature; 256 MB is generous
- Dashboard (Vite dev) has lower restart budget (3) — if Vite crashes 3x in 5 min, something is fundamentally broken
- ts-node-dev's `--respawn` flag provides an additional layer of restart for orchestration

---

## 4. Verification

```
Watchdog daemon started (PID 34367, project: project-ultima-epoch-engine)
Cycle #1 — 3 services monitored, 0 total restarts
Cycle #2 — 3 services monitored, 0 total restarts

Watchdog Status:
  Status:    RUNNING
  PID:       34367
  Project:   project-ultima-epoch-engine
  Cycles:    2
  Restarts:  0

All 3 services healthy:
  Orchestration (12064): {"status":"ok"}
  Logistics (12065):     {"status":"ok"}
  Dashboard (22064):     serving
```

---

## 5. Monitoring Matrix (Before vs After)

| Capability | Before Phase 16B | After Phase 16B |
|-----------|-----------------|----------------|
| PID tracking | Registry only | Registry + watchdog polling |
| Health checks | Startup only | Continuous (30s interval) |
| Auto-restart on crash | NONE | PID death triggers restart |
| Auto-restart on unresponsive | NONE | 3 consecutive failures |
| Memory leak detection | NONE | RSS threshold monitoring |
| Restart loop protection | NONE | Budget (5 in 5min window) |
| Daemon lifecycle | NONE | start/status/stop commands |
| Audit logging | NONE | /tmp/genesis_watchdog.log |

---

## 6. Remaining Considerations

| Item | Priority | Notes |
|------|----------|-------|
| launchd integration | LOW | Auto-start watchdog on macOS boot (not needed for dev) |
| Process group isolation | LOW | Each service in own process group (already using PID-only kill) |
| Log rotation | LOW | Watchdog log grows unbounded; add logrotate if long-running |
| Alerting | LOW | Could emit telemetry events on restart for dashboard visibility |

---

## Files Modified

| File | Change |
|------|--------|
| `genesis.yaml` | Added restart_policy + health_check intervals per service |
| `scripts/genesis_process.sh` | +300 lines: cmd_watchdog, restart_single_service, helpers |
| `scripts/pm.sh` | +50 lines: watchdog start/status/stop/help commands |
| This audit log | Created |
