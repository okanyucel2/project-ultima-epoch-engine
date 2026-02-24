# Chaos Monkey Report — Wave 17

**Date:** 2026-02-24 13:55:59
**Duration:** 37s
**Log:** /tmp/chaos_monkey_20260224_135522.log

---

## Pre-Flight

All services verified alive before chaos injection.

| Service | Port | Status |
|---------|------|--------|
| Orchestration | 12064 | ALIVE |
| Logistics | 12065 | ALIVE |
| Neo4j | 7474/7687 | HEALTHY |
| Dashboard | 22064 | SERVING |

---

## Chaos Sequence

| Phase | Target | Action | Time |
|-------|--------|--------|------|
| 1 | Node.js Orchestration | SIGKILL PID | 2s delay |
| 2 | Golang Logistics | Random signal (SIGKILL/SIGTERM) | 2s delay |
| 3 | Neo4j Docker | Stop 5s → Start | Container lifecycle |

---

## Recovery Results

| Service | Result |
|---------|--------|
| Orchestration | RECOVERED in 33s |
| Logistics | RECOVERED in 28s |
| Neo4j | RECOVERED in 25s |
| Dashboard | UNAFFECTED |

---

## Watchdog Log (during chaos)

```
[2026-02-24 13:55:12] [INFO] Watchdog daemon started (PID 36731, project: project-ultima-epoch-engine)
[2026-02-24 13:55:12] [INFO] Cycle #1 — 3 services monitored, 0 total restarts
[2026-02-24 13:55:42] [ERROR] project-ultima-epoch-engine:logistics PID 36124 is DEAD
[2026-02-24 13:55:45] [WARN] Restarting project-ultima-epoch-engine:logistics...
[2026-02-24 13:55:48] [OK] project-ultima-epoch-engine:logistics restarted (PID 36952, port 12065)
[2026-02-24 13:55:48] [ERROR] project-ultima-epoch-engine:backend PID 36425 alive but port 12064 has no listener — child process dead
[2026-02-24 13:55:49] [ERROR] project-ultima-epoch-engine:backend PID 36425 is DEAD
[2026-02-24 13:55:52] [WARN] Restarting project-ultima-epoch-engine:backend...
[2026-02-24 13:55:55] [OK] project-ultima-epoch-engine:backend restarted (PID 37019, port 12064)
```

---

## Full Chaos Log

```
[2026-02-24 13:55:22] [PHASE] CHAOS MONKEY STARTED
[2026-02-24 13:55:22] [PHASE] PRE-FLIGHT CHECKS
[2026-02-24 13:55:22] [OK] Orchestration alive (PID 36446, port 12064)
[2026-02-24 13:55:22] [OK] Logistics alive (PID 36129, port 12065)
[2026-02-24 13:55:22] [OK] Neo4j container healthy (port 7474/7687)
[2026-02-24 13:55:22] [OK] Dashboard serving (port 22064)
[2026-02-24 13:55:22] [OK] Pre-flight passed — all services alive
[2026-02-24 13:55:22] [PHASE] PHASE 1: Kill Node.js Orchestration (port 12064)
[2026-02-24 13:55:22] [INFO] Target PID: 36446 (RSS: 85072 KB)
[2026-02-24 13:55:22] [KILL] Sending SIGKILL to Orchestration (PID 36446)
[2026-02-24 13:55:24] [OK] Orchestration KILLED (PID 36446 is dead)
[2026-02-24 13:55:26] [PHASE] PHASE 2: Kill Golang Logistics (port 12065)
[2026-02-24 13:55:26] [INFO] Target PID: 36129 (RSS: 20736 KB)
[2026-02-24 13:55:26] [KILL] Sending SIGTERM to Logistics (PID 36129)
[2026-02-24 13:55:29] [OK] Logistics KILLED (PID 36129 is dead)
[2026-02-24 13:55:31] [PHASE] PHASE 3: Neo4j Docker Stop/Start (container: epoch-neo4j)
[2026-02-24 13:55:31] [KILL] Stopping Neo4j container...
[2026-02-24 13:55:32] [OK] Neo4j container STOPPED
[2026-02-24 13:55:32] [WAIT] Neo4j stays down for 5s...
[2026-02-24 13:55:37] [INFO] Starting Neo4j container...
[2026-02-24 13:55:37] [WAIT] Giving watchdog time to detect failures...
[2026-02-24 13:55:42] [PHASE] RECOVERY VERIFICATION
[2026-02-24 13:55:42] [WAIT] Orchestration — waiting for recovery (max 120s)...
[2026-02-24 13:55:57] [OK] Orchestration recovered after 15s
[2026-02-24 13:55:57] [INFO] Orchestration new PID: 37041
[2026-02-24 13:55:57] [WAIT] Logistics — waiting for recovery (max 120s)...
[2026-02-24 13:55:57] [OK] Logistics recovered after 0s
[2026-02-24 13:55:57] [INFO] Logistics new PID: 36957
[2026-02-24 13:55:57] [WAIT] Neo4j — waiting for Docker container to become healthy (max 120s)...
[2026-02-24 13:55:57] [OK] Neo4j container healthy after 0s
[2026-02-24 13:55:57] [OK] Dashboard still alive (unaffected by chaos)
[2026-02-24 13:55:57] [OK] ALL SERVICES RECOVERED
[2026-02-24 13:55:57] [PHASE] DEEP HEALTH CHECK
[2026-02-24 13:55:57] [INFO] Orchestration deep health: healthy
{
    "status": "healthy",
    "services": {
        "orchestration": {
            "status": "healthy",
            "latencyMs": 0,
            "details": "Orchestration server running"
        },
        "logistics": {
            "status": "healthy",
            "latencyMs": 14,
            "details": "Logistics backend responding"
        },
        "websocket": {
            "status": "healthy",
            "latencyMs": 0,
            "details": "WebSocket server active, 0 connection(s)"
        }
    },
    "timestamp": "2026-02-24T10:55:57.956Z"
}
[2026-02-24 13:55:58] [INFO] Logistics health: ok
[2026-02-24 13:55:58] [INFO] Simulation state: tickCount=0 (data preserved)
[2026-02-24 13:55:59] [OK] Neo4j Cypher query OK (data intact)
```
