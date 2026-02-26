# Wave 50 — The Puppeteer: NPC Command Infrastructure

**Date:** 2026-02-26
**Agent:** MAX (project-ultima-epoch-engine-worker)
**Directive:** Okan (P0.70 #WWOD — Kuklacı ve Fiziksel Hareket)

## Problem

UE5 NPCs were spawned (Wave 48) but couldn't move. No infrastructure existed to send navigation commands from orchestration to game engines. The Dumb Client doctrine requires all movement decisions to originate from the orchestration layer — UE5 only executes.

## Solution

### Phase 50A: NPC Command Channel & Schema

New `npc-commands` WebSocket channel with Zod-validated command types:

| Command | Purpose | Blackboard Keys |
|---------|---------|-----------------|
| `move_to` | Navigate to world-space XYZ | TargetLocationX/Y/Z, MovementSpeed, MovementMode, HasMoveTarget |
| `stop` | Halt all movement | HasMoveTarget=false, MovementSpeed=0 |
| `look_at` | Rotate to face target | LookAtX/Y/Z, HasLookAtTarget |
| `play_montage` | Trigger animation | MontageName, MontagePlayRate |

**Movement speed mapping (for Animation Blueprint):**
| Mode | Speed | Use Case |
|------|-------|----------|
| walk | 0.35 | Default patrol/work |
| run | 0.70 | Urgent movement |
| sprint | 1.00 | Emergency/rebellion |
| crouch | 0.20 | Stealth/saboteur |

### Phase 50B: REST API for Manual Testing

**Single command:** `POST /api/v1/npc/command`
```json
{
  "commandId": "cmd-001",
  "npcId": "npc-bones-001",
  "commandType": "move_to",
  "payload": {
    "targetLocation": { "x": 500, "y": -200, "z": 0 },
    "movementMode": "run",
    "acceptanceRadius": 75
  },
  "priority": 2
}
```

**Batch command:** `POST /api/v1/npc/command/batch`
- Up to 50 simultaneous commands
- Partial success: valid commands dispatched, invalid ones rejected with errors
- All 6 NPCs can receive movement commands simultaneously

### Phase 50C: Engine Exporter Integration

**UE5 Exporter:** Converts commands to BehaviorTree blackboard key-value pairs
- MoveTo → TargetLocation XYZ + MovementSpeed + AcceptanceRadius
- Stop → Clear movement target, speed = 0
- LookAt → LookAt XYZ coordinates
- PlayMontage → MontageName + PlayRate

**Godot Exporter:** Converts commands to GDScript signals + NavigationAgent3D node updates
- MoveTo → `npc_command_received` signal + NavigationAgent3D target_position update
- Stop → Signal only (NavigationAgent3D handles stop internally)

## Files

| # | File | Action | Changes |
|---|------|--------|---------|
| 1 | `packages/engine-bridge/src/schemas/npc-commands.ts` | NEW | Zod schemas for all command types |
| 2 | `packages/engine-bridge/src/schemas/index.ts` | MODIFY | Export npc-commands |
| 3 | `packages/engine-bridge/src/dispatcher.ts` | MODIFY | +npc-commands channel + schema |
| 4 | `packages/engine-bridge/src/exporters/base-exporter.ts` | MODIFY | +onNPCCommand abstract method |
| 5 | `packages/engine-bridge/src/exporters/ue5-exporter.ts` | MODIFY | +onNPCCommand (blackboard mapping) |
| 6 | `packages/engine-bridge/src/exporters/godot-exporter.ts` | MODIFY | +onNPCCommand (signals + nav3d) |
| 7 | `orchestration/src/services/websocket-server.ts` | MODIFY | +npc-commands to VALID_CHANNELS |
| 8 | `orchestration/src/index.ts` | MODIFY | +POST /api/v1/npc/command + batch |
| 9 | `packages/engine-bridge/__tests__/npc-commands.test.ts` | NEW | 19 tests |
| 10 | `orchestration/__tests__/npc-commands.test.ts` | NEW | 13 tests |
| 11 | `docs/reports/wave50-audit.md` | NEW | This audit |

**11 files, ~600 lines added**

## Test Results

```
Orchestration: 23/23 suites, 226/226 PASS (13 new)
Engine Bridge:  5/5  suites,  58/58  PASS (19 new)
Memory:         6/6  suites,  56/56  PASS
─────────────────────────────────────────────
TOTAL:         34/34 suites, 340/340 PASS
```

## Testing with Postman/curl

```bash
# Move Captain Bones to coordinates (500, -200, 0) at run speed
curl -X POST http://localhost:12064/api/v1/npc/command \
  -H "Content-Type: application/json" \
  -d '{
    "commandId": "test-001",
    "npcId": "npc-bones-001",
    "commandType": "move_to",
    "payload": {
      "targetLocation": {"x": 500, "y": -200, "z": 0},
      "movementMode": "run"
    }
  }'

# Move all 6 NPCs to a rally point
curl -X POST http://localhost:12064/api/v1/npc/command/batch \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"commandId":"rally-1","npcId":"npc-bones-001","commandType":"move_to","payload":{"targetLocation":{"x":0,"y":0,"z":0}}},
      {"commandId":"rally-2","npcId":"npc-vex-002","commandType":"move_to","payload":{"targetLocation":{"x":50,"y":0,"z":0}}},
      {"commandId":"rally-3","npcId":"npc-sera-003","commandType":"move_to","payload":{"targetLocation":{"x":-50,"y":0,"z":0}}},
      {"commandId":"rally-4","npcId":"npc-iron-004","commandType":"move_to","payload":{"targetLocation":{"x":0,"y":50,"z":0}}},
      {"commandId":"rally-5","npcId":"npc-bolt-005","commandType":"move_to","payload":{"targetLocation":{"x":0,"y":-50,"z":0}}},
      {"commandId":"rally-6","npcId":"npc-shade-006","commandType":"move_to","payload":{"targetLocation":{"x":100,"y":100,"z":0}}}
    ]
  }'
```

## UE5 Client Integration (Next Step)

UE5 client needs to:
1. Subscribe to `npc-commands` WebSocket channel
2. Parse `commandType` + `payload` from incoming messages
3. `move_to` → `UAIBlueprintHelperLibrary::SimpleMoveToLocation()` or `AAIController::MoveToLocation()`
4. `stop` → `AAIController::StopMovement()`
5. Bind `Velocity.Size()` → Animation Blueprint `Speed` variable
6. Idle ↔ Walk/Run state transitions based on Speed threshold
