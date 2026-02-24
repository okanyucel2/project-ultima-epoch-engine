# UE5 Visualization Bridge — Integration Guide

**Version:** 1.0 (Wave 22B Skeleton)
**Date:** 2026-02-24
**Status:** Data Contract Specification (implementation pending)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Unreal Engine 5 Client                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐     │
│  │ NPC Actors   │  │ Sim Tick     │  │ Rebellion VFX         │     │
│  │ (AI/Anim)    │  │ (World State)│  │ (Niagara/Materials)   │     │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘     │
│         │                 │                       │                  │
│         └─────────┬───────┴───────────────────────┘                  │
│                   │                                                  │
│            ┌──────┴──────┐                                          │
│            │ WS Client   │                                          │
│            │ (C++ / BP)  │                                          │
│            └──────┬──────┘                                          │
└───────────────────┼──────────────────────────────────────────────────┘
                    │ WebSocket (JSON)
                    │
              ws://host:32064
                    │
┌───────────────────┼──────────────────────────────────────────────────┐
│           Epoch Engine WebSocket Server                              │
│                   │                                                  │
│    ┌──────────────┼──────────────────────┐                          │
│    │  Channels:                          │                          │
│    │  ├── npc-events                     │                          │
│    │  ├── rebellion-alerts               │                          │
│    │  ├── simulation-ticks               │                          │
│    │  ├── telemetry                      │                          │
│    │  └── system-status                  │                          │
│    └─────────────────────────────────────┘                          │
│                                                                      │
│    Orchestration (TS:12064) ←──gRPC──→ Logistics (Go:12065)        │
│                                  ↕                                   │
│                          Neo4j Memory (7687)                         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Connection

**Endpoint:** `ws://localhost:32064` (dev) / `ws://<host>:32064` (production)
**Protocol:** WebSocket (RFC 6455), JSON text frames
**Reconnect:** Client should auto-reconnect every 5 seconds on disconnect

### Subscription Handshake

On connection open, send a JSON subscribe message:

```json
{
  "subscribe": ["npc-events", "simulation-ticks", "rebellion-alerts", "telemetry"]
}
```

The server immediately begins pushing events on subscribed channels.

### Base Message Envelope

Every message from the server follows this envelope:

```typescript
{
  "channel": string,       // Channel name
  "data": object,          // Channel-specific payload (see below)
  "timestamp": string      // ISO-8601 (e.g. "2026-02-24T14:30:00.123Z")
}
```

---

## Channel: `npc-events`

Real-time NPC state updates. Emitted when any NPC stat changes (action received, decay tick, rebellion threshold crossed).

### Payload Schema

```jsonc
{
  "channel": "npc-events",
  "data": {
    "npcId": "npc-bones-001",           // Unique NPC identifier
    "name": "Captain Bones",            // Display name
    "wisdomScore": 0.82,                // 0.0 - 1.0 (experience/knowledge)
    "traumaScore": 0.45,                // 0.0 - 1.0 (after time decay)
    "rebellionProbability": 0.67,       // 0.0 - 1.0 (rebellion risk)
    "confidenceInDirector": 0.33,       // 0.0 - 1.0 (trust in player)
    "workEfficiency": 0.70,             // 0.0 - 1.0 (productivity)
    "morale": 0.55,                     // 0.0 - 1.0 (general mood)
    "memoryCount": 347,                 // Total memories in Neo4j graph
    "status": "active"                  // "active" | "idle" | "rebelling"
  },
  "timestamp": "2026-02-24T14:30:00.123Z"
}
```

### UE5 Mapping

| JSON Field | UE5 Usage | Suggested Actor Property |
|------------|-----------|--------------------------|
| `npcId` | Actor lookup key | `FString NPCId` (replicated) |
| `name` | HUD/Widget display | `FText DisplayName` |
| `rebellionProbability` | Material parameter (glow/color) | `float RebellionProbability` |
| `traumaScore` | Animation blend weight | `float TraumaScore` |
| `morale` | Idle animation selection | `float Morale` |
| `workEfficiency` | Movement speed multiplier | `float WorkEfficiency` |
| `status` | State machine transition | `EEpochNPCStatus Status` |
| `confidenceInDirector` | Eye contact frequency / posture | `float ConfidenceInDirector` |

### Rebellion Visual Thresholds

| Probability | Visual Effect |
|-------------|--------------|
| 0.00 - 0.20 | Normal state, green aura |
| 0.20 - 0.35 | Subtle amber particles (HALT threshold approaching) |
| 0.35 - 0.50 | HALT threshold crossed — work slowdown animation |
| 0.50 - 0.80 | Red pulsing glow, agitated animations |
| 0.80 - 1.00 | VETO threshold — AEGIS intervention VFX, screen distortion |

---

## Channel: `simulation-ticks`

Periodic world state snapshot. Emitted every simulation tick (configurable, typically 1-5 seconds).

### Payload Schema

```jsonc
{
  "channel": "simulation-ticks",
  "data": {
    "tickNumber": 14523,                // Monotonic tick counter
    "resources": {
      "sim": {                          // Primary currency/energy
        "quantity": 1250.5,
        "productionRate": 12.3,         // Per tick
        "consumptionRate": 8.7          // Per tick
      },
      "rapidlum": {                     // Rare refined material
        "quantity": 89.2,
        "productionRate": 1.8,
        "consumptionRate": 2.1
      },
      "mineral": {                      // Raw extraction material
        "quantity": 3400.0,
        "productionRate": 25.0,
        "consumptionRate": 15.0
      }
    },
    "facilities": {
      "refineries": 3,                  // Active refineries
      "mines": 5                        // Active mines
    },
    "population": {
      "activeNPCs": 8,                  // Currently active NPCs
      "overallRebellionProbability": 0.42 // Population-wide average
    },
    "infestation": {
      "counter": 35.7,                  // 0-100 infestation level
      "isPlagueHeart": false,           // true when counter >= 100
      "throttleMultiplier": 1.0         // 1.0 normal, 0.5 during plague
    }
  },
  "timestamp": "2026-02-24T14:30:01.000Z"
}
```

### UE5 Mapping

| JSON Field | UE5 Usage |
|------------|-----------|
| `tickNumber` | Simulation clock sync |
| `resources.*` | HUD resource counters, world material params |
| `facilities.refineries` | Refinery building count/state |
| `facilities.mines` | Mine building count/state |
| `population.overallRebellionProbability` | Global post-processing (red tint) |
| `infestation.counter` | Fog/particle density, world decay level |
| `infestation.isPlagueHeart` | Full plague VFX activation |
| `infestation.throttleMultiplier` | Global animation speed multiplier |

---

## Channel: `rebellion-alerts`

High-priority alert when an NPC crosses the rebellion threshold. These are sparse events (not every tick).

### Payload Schema

```jsonc
{
  "channel": "rebellion-alerts",
  "data": {
    "eventId": "reb-evt-20260224-001",
    "npcId": "npc-bones-001",
    "npcName": "Captain Bones",
    "probability": 0.87,                // Probability at trigger
    "rebellionType": "active",          // "passive" | "active" | "collective"
    "triggerActionId": "act-cmd-042",   // What caused it
    "vetoedByAegis": false,             // True if Cognitive Rails blocked
    "vetoReason": null                  // Reason string if vetoed
  },
  "timestamp": "2026-02-24T14:30:05.456Z"
}
```

### UE5 Mapping

| `rebellionType` | Visual Response |
|-----------------|-----------------|
| `passive` | NPC slows down, drops tools, sulks animation |
| `active` | NPC raises fist, aggressive stance, red VFX burst |
| `collective` | Multiple NPCs converge, group animation, alarm klaxon |

When `vetoedByAegis: true` — play AEGIS intervention VFX (blue energy field containment).

---

## Channel: `telemetry`

Millisecond-precision psychological and physical events. Three sub-types:

### Mental Breakdown Payload

```jsonc
{
  "channel": "telemetry",
  "data": {
    "eventId": "tel-001",
    "npcId": "npc-vex-002",
    "severity": "critical",             // "info" | "warning" | "critical" | "catastrophic"
    "type": "mental_breakdown",
    "mentalBreakdown": {
      "breakdownType": "paranoia_onset", // See enum below
      "intensity": 0.78,
      "stressBefore": 0.65,
      "stressAfter": 0.92,
      "triggerContext": "act-cmd-039",
      "resolved": false,
      "recoveryProbability": 0.45
    },
    "npcSnapshot": { /* full NPCState */ }
  },
  "timestamp": "2026-02-24T14:30:02.789Z"
}
```

**Breakdown Types:** `stress_spike`, `psychological_fracture`, `identity_crisis`, `paranoia_onset`, `dissociation`, `rage_episode`

### Permanent Trauma Payload

```jsonc
{
  "channel": "telemetry",
  "data": {
    "eventId": "tel-002",
    "npcId": "npc-iron-004",
    "severity": "catastrophic",
    "type": "permanent_trauma",
    "permanentTrauma": {
      "traumaType": "limb_loss",        // See enum below
      "severity": 0.85,
      "affectedAttribute": "work_efficiency",
      "attributeReduction": 0.30,       // Absolute reduction
      "triggerContext": "mine_collapse_event",
      "phobiaTarget": null              // Only set for "phobia" type
    },
    "npcSnapshot": { /* full NPCState */ }
  },
  "timestamp": "2026-02-24T14:30:03.001Z"
}
```

**Trauma Types:** `limb_loss`, `morale_collapse`, `ptsd`, `survivors_guilt`, `phobia`, `brain_damage`

### State Change Payload

```jsonc
{
  "channel": "telemetry",
  "data": {
    "eventId": "tel-003",
    "npcId": "npc-sera-003",
    "severity": "info",
    "type": "state_change",
    "stateChange": {
      "attribute": "morale",
      "oldValue": 0.72,
      "newValue": 0.68,
      "cause": "Witnessed comrade punishment"
    }
  },
  "timestamp": "2026-02-24T14:30:03.500Z"
}
```

---

## Channel: `system-status`

Periodic system health metrics (every 10 seconds).

```jsonc
{
  "channel": "system-status",
  "data": {
    "eventsProcessed": 14523,
    "vetoes": 3,
    "avgLatencyMs": 12.5
  },
  "timestamp": "2026-02-24T14:30:10.000Z"
}
```

---

## UE5 Implementation Recommendations

### 1. WebSocket Client (C++)

Use `FWebSocketsModule` (built-in since UE 4.27):

```cpp
// EpochWSClient.h
UCLASS()
class UEpochWSClient : public UGameInstanceSubsystem
{
    GENERATED_BODY()

    TSharedPtr<IWebSocket> Socket;

    void Connect(const FString& URL);  // ws://host:32064
    void Subscribe(const TArray<FString>& Channels);
    void OnMessage(const FString& Message);

    DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(
        FOnNPCEvent, const FString&, NPCId, const FEpochNPCState&, State);
    UPROPERTY(BlueprintAssignable)
    FOnNPCEvent OnNPCEvent;
};
```

### 2. Data Structs

```cpp
USTRUCT(BlueprintType)
struct FEpochNPCState
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString NPCId;
    UPROPERTY(BlueprintReadOnly) FString Name;
    UPROPERTY(BlueprintReadOnly) float WisdomScore;
    UPROPERTY(BlueprintReadOnly) float TraumaScore;
    UPROPERTY(BlueprintReadOnly) float RebellionProbability;
    UPROPERTY(BlueprintReadOnly) float ConfidenceInDirector;
    UPROPERTY(BlueprintReadOnly) float WorkEfficiency;
    UPROPERTY(BlueprintReadOnly) float Morale;
    UPROPERTY(BlueprintReadOnly) int32 MemoryCount;
    UPROPERTY(BlueprintReadOnly) EEpochNPCStatus Status;
};

UENUM(BlueprintType)
enum class EEpochNPCStatus : uint8
{
    Active,
    Idle,
    Rebelling
};
```

### 3. Material Parameter Binding

For rebellion visualization on NPC meshes:

```
Material Dynamic Instance:
  - "RebellionIntensity" (scalar, 0-1) → drives emissive glow
  - "TraumaWeight" (scalar, 0-1) → drives desaturation/vein overlay
  - "MoraleLevel" (scalar, 0-1) → drives posture blend
```

### 4. Niagara VFX Triggers

| Event | Niagara System |
|-------|---------------|
| Rebellion probability > 0.8 | `NS_RebellionAura` (red particles) |
| AEGIS veto fired | `NS_AEGISContainment` (blue energy field) |
| Mental breakdown | `NS_PsychFracture` (screen crack overlay) |
| Permanent trauma | `NS_TraumaScar` (persistent dark particles) |
| Plague Heart active | `NS_PlagueHeart` (world-space fog/decay) |

---

## Proto Reference

All data contracts derive from protobuf definitions in `shared/proto/`:

| File | Package | Key Messages |
|------|---------|--------------|
| `common.proto` | `epoch.common` | `EpochTimestamp`, `EventTier`, `ErrorCode` |
| `npc.proto` | `epoch.npc` | `NPCState`, `NPCAction`, `RebellionEvent`, `ConfidenceRelation` |
| `simulation.proto` | `epoch.simulation` | `SimulationStatus`, `ResourceState`, `InfestationStatus` |
| `telemetry.proto` | `epoch.telemetry` | `TelemetryEvent`, `MentalBreakdownEvent`, `PermanentTraumaEvent` |

---

## Next Steps (Future Waves)

1. **WebSocket Server Implementation** — Implement the `simulation-ticks` and `telemetry` channels in `orchestration/src/websocket/`
2. **UE5 Plugin** — Package the C++ WebSocket client as an Engine plugin
3. **Blueprint API** — Expose all channels as Blueprint events for rapid prototyping
4. **Binary Protocol** — Evaluate switching from JSON to MessagePack for lower latency
5. **Authentication** — Add token-based auth to WebSocket handshake for production
