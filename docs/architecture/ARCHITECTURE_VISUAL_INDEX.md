# Architecture Visual Index — Code Mapping Reference

**Purpose:** Text-based descriptions of all architecture diagrams with direct mappings
to source code files, functions, and data flows. Designed for agent onboarding —
any agent reading this document can understand the full system architecture without
viewing the visual diagrams.

**Diagrams Covered:**
1. [Universal Game Engine Bridge](#1-universal-game-engine-bridge)
2. [3-Layer Resilience Architecture](#2-3-layer-resilience-architecture)
3. [3-Layer Defense & Self-Healing](#3-3-layer-defense--self-healing-process-manager)

---

## 1. Universal Game Engine Bridge

**Diagram:** `docs/architecture/universal-engine-bridge.jpg`
**Implemented in:** Wave 23 — `packages/engine-bridge/`

### Overview

Three-layer architecture connecting AI backend intelligence to game engine visualization.
Game engines are **dumb clients** — all intelligence, validation, and state derivation
stays in the TypeScript adapter layer.

### Layer Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  KATMAN 1: AI ZEKA VE KARAR MERKEZİ (Backend)                             │
│  ══════════════════════════════════════════════                             │
│                                                                             │
│  ┌──────────────────┐    gRPC     ┌──────────────────┐                     │
│  │   Neural Mesh    │ ──────────→ │ Logistics Backend │                     │
│  │  (Node.js / TS)  │            │    (Golang)        │                     │
│  │                  │            │                    │                     │
│  │  AI Orchestration│            │  Rebellion Engine  │                     │
│  │  LLM Routing     │            │  Resource Sim      │                     │
│  │  NPC Psychology   │            │  Probability Calc  │                     │
│  └────────┬─────────┘            └────────┬───────────┘                     │
│           │                               │                                 │
│           └──────────┬────────────────────┘                                 │
│                      ▼                                                      │
│           ┌──────────────────┐                                              │
│           │   Experience DB  │                                              │
│           │     (Neo4j)      │                                              │
│           │                  │                                              │
│           │  Memory Graph    │                                              │
│           │  Wisdom Scores   │                                              │
│           │  Trauma History  │                                              │
│           └──────────────────┘                                              │
│                                                                             │
│  AEGIS Bilişsel Raylar: NPC isteğini AEGIS Cognitive Rails'den geçirir.    │
│  Veto Protocol: Hallucination/risk threshold aşılırsa aksiyonu bloklar.    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼  WebSocket :32064 (JSON)
                                    │  + gRPC (primary)
                                    │  + HTTP/REST (fallback)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  KATMAN 2: OTONOM ADAPTÖR KATMANI (Köprü / Bridge)                        │
│  ══════════════════════════════════════════════════                         │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                  @epoch/engine-bridge SDK                         │      │
│  │                                                                   │      │
│  │  ┌──────────────┐    ┌────────────────┐    ┌──────────────────┐  │      │
│  │  │  Zod Schemas  │──→│  EpochDispatcher│──→│  Engine Exporters │  │      │
│  │  │  (5 channels) │    │  (validate +   │    │                  │  │      │
│  │  │              │    │   route events) │    │  ┌─────────────┐ │  │      │
│  │  │  • npc-events│    │                │    │  │GodotExporter│ │  │      │
│  │  │  • rebellion │    │  processMessage│    │  │UE5Exporter  │ │  │      │
│  │  │  • sim-ticks │    │  connect()     │    │  │(extensible) │ │  │      │
│  │  │  • telemetry │    │  stats         │    │  └─────────────┘ │  │      │
│  │  │  • sys-status│    └────────────────┘    └──────────────────┘  │      │
│  │  └──────────────┘                                                 │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  Dual-Protocol: gRPC primary, HTTP/REST fallback. Her bağlantı             │
│  kesintisinde otomatik olarak HTTP/REST'e düşer.                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                          │                          │
                          ▼                          ▼
┌──────────────────────────────┐  ┌──────────────────────────────────────────┐
│                              │  │                                          │
│  KATMAN 3A: Godot 4.x       │  │  KATMAN 3B: Unreal Engine 5              │
│  ════════════════════        │  │  ════════════════════════                │
│                              │  │                                          │
│  Stylize (Stilize)           │  │  AAA MetaHuman Deneyimi                 │
│  Prototipleme                │  │                                          │
│                              │  │  FEpochNPCState structs                 │
│  Bağlantı: C++ Plugin /     │  │  Behavior Tree Blackboard               │
│            WebSocket         │  │  MetaHuman 14 morph targets             │
│  Veri: GDScript / JSON      │  │  Niagara VFX systems                    │
│  Tepki: 1-3 Halfa (Gelişim) │  │  Material parameter binding             │
│                              │  │                                          │
│  GDScript Signals            │  │  Captain Bones fotorealistik            │
│  AnimationTree params        │  │  yüz ifadeleri, travma ve               │
│  Node property batches       │  │  moral verilerine göre                  │
│  Shader color parameters     │  │  metahuman animasyonları                │
│                              │  │                                          │
└──────────────────────────────┘  └──────────────────────────────────────────┘
```

### Code Mapping: Layer 1 → Backend Intelligence

| Visual Element | Source Files | Key Functions/Classes |
|----------------|-------------|----------------------|
| **Neural Mesh (Node.js/TS)** | `orchestration/src/neural-mesh/` | AI agent coordination, LLM routing |
| **Logistics Backend (Go)** | `logistics/internal/rebellion/` | Rebellion probability engine |
| | `logistics/internal/simulation/` | Resource sim (Sim, Rapidlum, Mineral) |
| | `logistics/cmd/server/main.go` | gRPC server on :12065 |
| **Experience DB (Neo4j)** | `memory/src/graph/connection-pool.ts` | `Neo4jConnectionPool` class |
| | `memory/src/graph/retry-queue.ts` | `RetryQueue` ring buffer fallback |
| | `memory/src/wisdom/` | Wisdom scoring system |
| | `memory/src/trauma/` | Trauma/confidence scoring |
| **AEGIS Cognitive Rails** | `orchestration/src/agents/` | Veto Protocol, hallucination blocking |
| **gRPC Transport** | `shared/proto/` | Protocol Buffer definitions |
| | `orchestration/src/generated/` | Generated TypeScript stubs |

### Code Mapping: Layer 2 → Adapter (Engine Bridge SDK)

| Visual Element | Source File | Key Exports |
|----------------|-----------|-------------|
| **Zod Schemas (5 channels)** | `packages/engine-bridge/src/schemas/common.ts` | `EnvelopeSchema`, `UnitFloat`, `NPCStatusSchema` |
| | `packages/engine-bridge/src/schemas/npc-events.ts` | `NPCEventSchema` — rebellion, trauma, wisdom, morale |
| | `packages/engine-bridge/src/schemas/simulation-ticks.ts` | `SimulationTickSchema` — resources, infestation |
| | `packages/engine-bridge/src/schemas/rebellion-alerts.ts` | `RebellionAlertSchema` — veto, rebellion type |
| | `packages/engine-bridge/src/schemas/telemetry.ts` | `TelemetryEventSchema` — breakdown, trauma, state change |
| | `packages/engine-bridge/src/schemas/index.ts` | Barrel export |
| **EpochDispatcher** | `packages/engine-bridge/src/dispatcher.ts` | `EpochDispatcher` class |
| | | `processMessage(raw: string)` — JSON → Zod validate → route |
| | | `on(channel, handler)` / `off(channel, handler)` |
| | | `connect(WebSocketImpl?)` — lifecycle management |
| | | `stats` — totalReceived, totalDispatched, totalErrors |
| | | `CHANNEL_SCHEMAS` registry (line 70) — zero-change extensibility |
| **Base Exporter Interface** | `packages/engine-bridge/src/exporters/base-exporter.ts` | `EngineExporter` interface |
| | | `BaseExporter` abstract class — attach/detach boilerplate |
| **Barrel Export** | `packages/engine-bridge/src/index.ts` | Re-exports all public API |

### Code Mapping: Layer 3A → Godot Exporter

| Visual Element | Source Location | Details |
|----------------|----------------|---------|
| **GodotExporter class** | `packages/engine-bridge/src/exporters/godot-exporter.ts` | 347 lines |
| **GDScript Signals** | `godot-exporter.ts:108-121` | `npc_state_updated`, `simulation_tick`, `rebellion_triggered`, `aegis_veto_fired`, `mental_breakdown`, `permanent_trauma_inflicted`, `npc_stat_changed` |
| **AnimationTree** | `godot-exporter.ts:65-71` | `deriveAnimState()` — idle/walk/agitated/rebel |
| **BlendSpace2D** | `godot-exporter.ts:73-82` | `deriveBlendPosition()` — X=agitation, Y=fatigue |
| **Node Properties** | `godot-exporter.ts:131-151` | Paths: `/root/World/NPCs/{id}`, `/root/World/NPCs/{id}/RebellionAura` |
| **Shader Colors** | `godot-exporter.ts:319-346` | `rebellionColor()` — Green→Amber→Red gradient; `breakdownColor()` per type |
| **Output Type** | `godot-exporter.ts:46-51` | `GodotFrame { signals, animationParams, nodeUpdates, timestamp }` |

**Thresholds (shared with UE5):**
- `HALT_THRESHOLD = 0.35` — agitation begins, aura visible
- `VETO_THRESHOLD = 0.80` — AEGIS may veto, rebel state

### Code Mapping: Layer 3B → UE5 MetaHuman Exporter

| Visual Element | Source Location | Details |
|----------------|----------------|---------|
| **UE5Exporter class** | `packages/engine-bridge/src/exporters/ue5-exporter.ts` | 448 lines |
| **FEpochNPCState** | `ue5-exporter.ts:22-33` | USTRUCT-compatible: PascalCase fields, Status enum |
| **BT Blackboard** | `ue5-exporter.ts:141-167` | `deriveBlackboard()` — IsRebelling, IsCritical, MovementSpeed, PreferredBehavior |
| **MetaHuman Face** | `ue5-exporter.ts:89-135` | `deriveEmotions()` — 14 ARKit morph targets + 5 emotion curves |
| **Niagara VFX** | `ue5-exporter.ts:224-241` | NS_RebellionAura, NS_AEGISContainment, NS_PsychFracture, NS_TraumaScar, NS_PlagueHeart, NS_RebellionPassive/Active/Collective |
| **Material Params** | `ue5-exporter.ts:217-221` | RebellionIntensity, TraumaWeight, MoraleLevel |
| **Breakdown Faces** | `ue5-exporter.ts:405-447` | `breakdownFaceMorphs()` — rage/paranoia/dissociation/fracture/stress/identity profiles |
| **Output Type** | `ue5-exporter.ts:68-75` | `UE5Frame { structs, blackboards, faceStates, vfxTriggers, materialParams, timestamp }` |

**MetaHuman Morph Target Derivation:**

| Morph Target | Formula | Emotional Driver |
|--------------|---------|-----------------|
| `browDownLeft/Right` | `rebellion * 0.8 + trauma * 0.3` | Anger/frustration |
| `browInnerUp` | `trauma > 0.6 ? trauma * 0.7 : 0` | Worry/distress |
| `eyeSquintLeft/Right` | `rebellion > 0.5 ? rebellion * 0.6 : 0` | Suspicion/hostility |
| `eyeWideLeft/Right` | `trauma > 0.7 ? (trauma - 0.7) * 3 : 0` | Fear/shock |
| `mouthFrownLeft/Right` | `(1 - morale) * 0.8` | Sadness/dissatisfaction |
| `mouthSmileLeft/Right` | `morale > 0.7 ? (morale - 0.7) * 3 : 0` | Rare contentment |
| `jawOpen` | `rebellion > VETO (0.80) ? 0.3 : 0` | Shouting/defiance |
| `noseSneerLeft/Right` | `rebellion > 0.6 ? (rebellion - 0.6) * 2 : 0` | Contempt/disgust |

**Emotion Curves:**

| Curve | Formula |
|-------|---------|
| Anger | `rebellion * 0.7 + (1 - confidence) * 0.3` |
| Fear | `trauma > 0.5 ? (trauma - 0.5) * 2 : 0` |
| Sadness | `(1 - morale) * 0.6 + trauma * 0.4` |
| Contempt | `rebellion > 0.4 ? (rebellion - 0.4) * 1.5 * (1 - confidence) : 0` |
| Neutral | `max(0, 1 - rebellion - trauma * 0.5)` |

### Data Flow (End-to-End)

```
NPC Action Decision (Neural Mesh)
  → Logistics evaluates rebellion probability (Go gRPC)
    → Memory graph updated (Neo4j)
      → Event published to WebSocket :32064 (JSON envelope)
        → EpochDispatcher.processMessage() validates via Zod
          → Routes to registered exporter(s)
            → GodotExporter.onNPCEvent() → GodotFrame → GDScript signal
            → UE5Exporter.onNPCEvent() → UE5Frame → USTRUCT + MetaHuman face
```

### WebSocket Protocol

Port: **32064** | Format: **JSON envelope**

```json
{
  "channel": "npc-events",
  "data": {
    "npcId": "npc-bones-001",
    "name": "Captain Bones",
    "rebellionProbability": 0.87,
    "traumaScore": 0.91,
    "...": "..."
  },
  "timestamp": "2026-02-24T15:00:00.000Z"
}
```

5 Channels: `npc-events` | `rebellion-alerts` | `simulation-ticks` | `telemetry` | `system-status`

### Tests

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `__tests__/schemas.test.ts` | 14 | Zod validation, defaults, rejection |
| `__tests__/dispatcher.test.ts` | 7 | Routing, errors, stats, multi-handler |
| `__tests__/godot-exporter.test.ts` | 9 | Signals, AnimTree, node props, VFX |
| `__tests__/ue5-exporter.test.ts` | 9 | USTRUCT, blackboard, morphs, Niagara |

---

## 2. 3-Layer Resilience Architecture

**Diagram:** `docs/architecture/3-layer-resilience-architecture.jpg`
**Implemented in:** Waves 15-21

### Overview

Fault tolerance and self-healing across three layers: service health (process level),
data persistence (Neo4j outage survival), and cognitive visibility (human operator
blindness prevention). Each layer operates independently — failure in one doesn't
cascade to others.

### Layer Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  1. KATMAN: HİZMET DAYANAKLILIĞI (Watchdog & Check-0)                      │
│  ═════════════════════════════════════════════════════                      │
│                                                                             │
│  ┌─────────────────────────────────┐   ┌──────────────────────────────────┐ │
│  │  Check-0: Port Liveness         │   │  Restart Budget                  │ │
│  │                                 │   │                                  │ │
│  │  PID Tracker ──→ Port 12064/    │   │  Max 5 Yeniden Başlatma          │ │
│  │                   12065         │   │  ┌─┐┌─┐┌─┐┌─┐┌─┐               │ │
│  │  3-Katmanlı Probe:             │   │  │1││2││3││4││5│               │ │
│  │   • Port liveness (TCP)        │   │  └─┘└─┘└─┘└─┘└─┘               │ │
│  │   • PID alive (kill -0)        │   │                                  │ │
│  │   • Health endpoint (/health)  │   │  Kurtarma Süresi: 0-3 min       │ │
│  │                                 │   │  Kayan Pencere: 5 dakika         │ │
│  │  Catches: Zombie Process,       │   │                                  │ │
│  │  Wrapper-alive-child-dead,      │   │  Budget aşılırsa → Karantina    │ │
│  │  Port hijack                    │   │  (Sonsuz Çökme Döngüsü Önleme) │ │
│  └─────────────────────────────────┘   └──────────────────────────────────┘ │
│                                                                             │
│  3-Katmanlı İzleme Hattı:                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ Tespit Yöntemi  │  Tespit Süresi  │  Müdahale Hedefi            │       │
│  │ Port Liveness   │  ~3s            │  Zombi Öldürme / Zombi Süreç│       │
│  │ Health Endpoint │  90s (3x30s)    │  Yeniden Başlatma            │       │
│  │ Memory (RSS)    │  ~30s           │  Bellek Sızıntısı Önleme     │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  2. KATMAN: VERİ DAYANAKLILIĞI (Neo4j RetryQueue)                          │
│  ═══════════════════════════════════════════════════                        │
│                                                                             │
│  ┌──────────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │          Ring Buffer             │  │  Otonom Boşaltma (Auto-Flush)   │ │
│  │                                  │  │                                 │ │
│  │  Neo4j ──→ Bağlantı ──→ Ring    │  │  Connection re-established?     │ │
│  │            Kesildi      Buffer   │  │  ──→ Flush queue in FIFO order  │ │
│  │                                  │  │  ──→ Posting sıralı veri       │ │
│  │  RetryQueue                      │  │      testleri                   │ │
│  │  Capacity: 1,000 Operations     │  │  ──→ Kalıcı Bellek              │ │
│  │  Max Age: 5 dk                   │  │                                 │ │
│  │                                  │  │  5 Saniyede Bir flush attempt   │ │
│  │  Oldest evicted when full        │  │                                 │ │
│  │  (prevents memory leak)          │  │  Sıfır Veri Kaybı Garantisi    │ │
│  └──────────────────────────────────┘  │  (buffer kapasitesi içinde)     │ │
│                                         └─────────────────────────────────┘ │
│                                                                             │
│  gRPC ←──→ Neo4j   |   TypeScript ←──→ Neo4j                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  3. KATMAN: BİLİŞSEL DAYANAKLILIK (Vue Dashboard)                         │
│  ═══════════════════════════════════════════════════                        │
│                                                                             │
│  ┌─────────────────────────┐  ┌────────────────────────────────────────┐   │
│  │  Rebellion Heatmap       │  │  Prizma Etkisi (Prism Effect) Önleme  │   │
│  │  (Isyan Isı Haritası)   │  │                                        │   │
│  │                          │  │  Numbers alone cause cognitive         │   │
│  │  ┌───────────────────┐  │  │  blindness. Color-coded heatmap makes  │   │
│  │  │ ■■■■ ■■■■ ■■■■   │  │  │  danger immediately visible.           │   │
│  │  │ Green → Red       │  │  │                                        │   │
│  │  │ Low    High       │  │  │  En tehlikeli NPC'ler otomatik olarak  │   │
│  │  │ Threat Threat     │  │  │  en üst dizende sıralanır.             │   │
│  │  └───────────────────┘  │  │                                        │   │
│  │                          │  │  Şerif Protokolü Görsel                │   │
│  │  Dual heatmap:           │  │  Entegrasyonu — sorted by danger       │   │
│  │  • Rebellion probability │  │                                        │   │
│  │  • Trauma score          │  │                                        │   │
│  └─────────────────────────┘  └────────────────────────────────────────┘   │
│                                                                             │
│  Tespit Tablosu:                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │ Tespit Yöntemi       │  Tespit Süresi  │  Müdahale Hedefi         │     │
│  │ Port Liveness (Chk0) │  ~3s            │  Zombi Öldürme           │     │
│  │ Health Check Failure  │  90s (3x30s)   │  Kilitleme / Yeni Başlat │     │
│  │ Memory Threshold RSS  │  ~30s          │  Bellek Sızıntısı Önleme │     │
│  │ Neo4j RetryQueue      │  —             │  Veritabanı Bağlantı     │     │
│  │                       │                │  Kesintisi               │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Code Mapping: Layer 1 → Service Resilience

| Visual Element | Source File | Key Function / Section |
|----------------|-----------|----------------------|
| **Check-0: Port Liveness** | `scripts/genesis_process.sh:2263-2275` | `lsof -ti:{port}` — catches wrapper-alive-child-dead |
| **Check-1: PID Alive** | `scripts/genesis_process.sh:2277-2318` | `kill -0 $svc_pid` — process existence verification |
| **Check-2: Health Endpoint** | `scripts/genesis_process.sh:2320-2350` | `curl -sf --max-time $timeout` against `/health` |
| **Restart Budget** | `scripts/genesis_process.sh:2297-2303` | max_restarts per restart_window (5 min sliding window) |
| **Quarantine** | `scripts/genesis_process.sh:2297-2303` | Budget exceeded → service quarantined (infinite crash loop prevention) |
| **Watchdog Config** | `scripts/genesis_process.sh:1916-1953` | `read_watchdog_config()` — parses `genesis.yaml` per service |
| **genesis.yaml** | `projects/project-ultima-epoch-engine/genesis.yaml` | `restart_policy:` section — max_restarts, restart_window, restart_delay, memory_limit_mb |

**Detection Timeline:**

| Check | Detection Time | Target |
|-------|---------------|--------|
| Port Liveness (Check-0) | ~3 seconds | Zombie process, port hijack |
| Health Endpoint (Check-2) | ~90 seconds (3 failures × 30s) | Unresponsive service |
| Memory RSS Threshold | ~30 seconds | Memory leak (RSS > limit) |

### Code Mapping: Layer 2 → Data Resilience

| Visual Element | Source File | Key Class / Function |
|----------------|-----------|---------------------|
| **Ring Buffer** | `memory/src/graph/retry-queue.ts` | `RetryQueue` class |
| | | `capacity: 1000` (default) |
| | | `maxAgeMs: 300000` (5 min) |
| | | `flushIntervalMs: 5000` |
| **Enqueue on failure** | `retry-queue.ts` | `enqueue(query, params)` — adds to ring buffer |
| **FIFO eviction** | `retry-queue.ts` | Oldest entries evicted when capacity exceeded |
| **Auto-Flush** | `retry-queue.ts` | `startFlush(session)` — flushes queue on reconnection |
| **Connection Pool** | `memory/src/graph/connection-pool.ts` | `Neo4jConnectionPool` class |
| | | `maxSessions: 10`, `acquireTimeoutMs: 5000` |
| | | `retryQueue` property — integrated ring buffer |
| **Zero Data Loss** | Guaranteed within buffer capacity (1000 ops). Beyond that, oldest evicted. |

**Data Flow on Neo4j Outage:**

```
Neo4j connection drops
  → ConnectionPool detects failure
    → Operations route to RetryQueue.enqueue()
      → Ring buffer holds up to 1000 operations (5 min max age)
        → Neo4j reconnects
          → RetryQueue.startFlush() fires
            → FIFO replay to Neo4j
              → Zero data loss (within capacity)
```

### Code Mapping: Layer 3 → Cognitive Resilience

| Visual Element | Source File | Key Component / Feature |
|----------------|-----------|------------------------|
| **Rebellion Heatmap** | `dashboard/src/components/RebellionHeatmap.vue` | Vue 3 `<script setup>` component |
| | | Props: `npcs: NPCState[]`, `metric: 'rebellion' \| 'trauma'` |
| | | Color: Green (#22c55e) → Amber (#f59e0b) → Red (#dc2626) |
| | | Sorted: Most dangerous NPCs first |
| **Dual Heatmap Integration** | `dashboard/src/views/RebellionDashboardView.vue` | Two `<RebellionHeatmap>` instances — rebellion + trauma |
| **Demo Mode** | `dashboard/src/composables/useNPCMonitor.ts` | `seedDemoData()` — 8 mock NPCs after 3s timeout |
| **Prism Effect Prevention** | Concept | Numbers alone cause cognitive blindness. Color gradients bypass this. |
| **Sheriff Protocol** | Sort order | NPCs auto-sorted by danger level (highest rebellion first) |

**Prism Effect Rationale:**
- A table showing "0.87, 0.68, 0.45, 0.92" requires mental parsing
- A heatmap showing "RED, AMBER, GREEN, RED" is instantly parsed
- Critical NPCs always appear at top-left (sorted descending)

---

## 3. 3-Layer Defense & Self-Healing (Process Manager)

**Diagram:** `docs/architecture/3-layer-defense-architecture.jpg`
**Implemented in:** Wave 15-16

### Overview

The Process Manager (genesis_process.sh) defense architecture. Focuses on the
watchdog daemon's three check phases and the autonomous restart budget system.
This is the *process-level* view of Layer 1 from the Resilience Architecture above.

### Layer Diagram (Text)

```
┌─────────────────────────────────────────────────────┐
│  Katman 1: Port Canlılığı (Check 0) ve PID Kontrolü │
│                                                      │
│  Kontrol 0 (Port Denetimi) → 12064/12065            │
│                                                      │
│  Tespit Süresi: ~3s (Sarmalayıcı Çökmesi,           │
│                      PID ~3s Dağıtıcı Çökmesi)      │
│                                                      │
│  Catches: Zombie Process, Wrapper alive but          │
│           child port not listening                    │
│                                                      │
│  Sarmalayıcı Yanılsaması: PID alive but port dead    │
│  → Check-0 catches this and kills zombie wrapper     │
├──────────────────────────────────────────────────────┤
│  Katman 2: Sağlık Ucu (Health Endpoint) İzleme      │
│                                                      │
│  /health endpoint → DB Bağlantısı: OK               │
│                   → İş Süreci: OK                    │
│                                                      │
│  Tespit Süresi: 90s (3x30s — three strikes)         │
│  Covers: Zombie Süreçler (process running but        │
│          not serving requests)                        │
├──────────────────────────────────────────────────────┤
│  Katman 3: RSS Bellek Eşiği (Memory Threshold)      │
│                                                      │
│  Bellek Sızıntısı (Memory Leak) > Eşik              │
│  → Otonom Yeniden Başlatma                           │
│                                                      │
│  Tespit Süresi: ~30s (Yavaş Sızıntı)               │
│  Covers: Gradual memory leaks that don't crash       │
│          but degrade performance                     │
└──────────────────────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │  Otonom İyileştirme ve Yeniden     │
         │  Başlatma Bütçesi                  │
         │                                    │
         │  13 Saniyelik Kendi Kendini        │
         │  İyileştirme:                      │
         │  Ortalama 13 saniyede (ve 90s)     │
         │  SIGKILL sonrası ayağa kalkar      │
         │                                    │
         │  Yeniden Başlatma Bütçesi:         │
         │                                    │
         │       Kalan Hakkı: 5 / 5           │
         │                                    │
         │  1 → 2 → 3 → 4 → 5 → Karantina   │
         │                                    │
         │  5 Dakika Kayan Pencere            │
         │  Budget resets after window passes  │
         │                                    │
         │  Step 6: Yönetmen Müdahalesi       │
         │  Gerekli (manual intervention)     │
         │  Döngü durdurulur,                 │
         │  operatöre bildirim gönderilir     │
         └────────────────────────────────────┘
```

### Code Mapping

| Visual Element | Source Location | Details |
|----------------|----------------|---------|
| **Check-0 Port Liveness** | `genesis_process.sh:2263-2275` | `lsof -ti:{port}` per service |
| **Check-1 PID Alive** | `genesis_process.sh:2277-2318` | `kill -0 $svc_pid` |
| **Check-2 Health Endpoint** | `genesis_process.sh:2320-2350` | `curl -sf --max-time $timeout $health_url` |
| **Restart Budget (5/5)** | `genesis_process.sh:2297-2303` | `restart_count < max_restarts` within `restart_window` |
| **Quarantine** | `genesis_process.sh:2297-2303` | Budget exceeded → stop attempting restarts |
| **13s Self-Healing** | Measured empirically | Average time from SIGKILL to service responsive |
| **5 min Sliding Window** | `genesis.yaml:restart_policy` | `restart_window: 300` (seconds) |
| **Watchdog Loop** | `genesis_process.sh` (watchdog function) | Main loop: sleep → check-0 → check-1 → check-2 → act |

**Restart Decision Flow:**

```
Watchdog tick
  ├─ Check-0: Port listening?
  │    NO → Kill zombie wrapper PID → Restart
  │    YES → Continue
  ├─ Check-1: PID alive?
  │    NO → Restart (if budget allows)
  │    YES → Continue
  └─ Check-2: Health endpoint OK?
       NO → Increment failure counter
       │    3 consecutive failures → Restart (if budget allows)
       YES → Reset failure counter

On Restart:
  ├─ Budget remaining? → Restart, decrement budget
  └─ Budget exhausted? → Quarantine service, alert operator
```

---

## Cross-Cutting Concerns

### Port Allocation (All Layers)

| Service | Port | Layer Reference |
|---------|------|----------------|
| Orchestration (Node.js) | 12064 | Layer 1 Check-0, Layer 2 gRPC |
| Logistics (Golang) | 12065 | Layer 1 Check-0, Layer 2 gRPC |
| Dashboard (Vue) | 22064 | Layer 3 Heatmap visualization |
| WebSocket Bridge | 32064 | Layer 2 Adapter, Engine Bridge |
| Neo4j HTTP | 7474 | Layer 2 Data Resilience |
| Neo4j Bolt | 7687 | Layer 2 Data Resilience |

### Threshold Constants (Used Across Layers)

| Constant | Value | Used In |
|----------|-------|---------|
| `HALT_THRESHOLD` | 0.35 | Godot agitated state, UE5 IsAgitated flag, Heatmap amber zone |
| `VETO_THRESHOLD` | 0.80 | AEGIS veto trigger, Godot rebel state, UE5 IsCritical flag, Heatmap red zone |
| Ring Buffer Capacity | 1,000 | RetryQueue max operations |
| Ring Buffer Max Age | 300s (5 min) | RetryQueue operation expiry |
| Restart Budget | 5 | Max restarts per sliding window |
| Restart Window | 300s (5 min) | Budget reset period |

### Adding a New Game Engine

To add a new engine exporter (e.g., Bevy, custom WebGL):

1. Create `packages/engine-bridge/src/exporters/{engine}-exporter.ts`
2. Extend `BaseExporter` from `base-exporter.ts`
3. Implement 4 methods: `onNPCEvent`, `onSimulationTick`, `onRebellionAlert`, `onTelemetryEvent`
4. Define your engine-native output frame type
5. Export from `packages/engine-bridge/src/index.ts`
6. **Zero changes needed in dispatcher or schemas** — the channel-schema registry is engine-agnostic

---

*Last updated: 2026-02-24 — Waves 15-23*
*Visual diagrams: `docs/architecture/*.jpg`*
