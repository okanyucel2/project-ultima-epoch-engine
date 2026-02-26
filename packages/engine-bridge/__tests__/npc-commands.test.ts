// =============================================================================
// NPC Commands Tests — Schema validation + UE5/Godot exporter (Wave 50)
// =============================================================================

import {
  NPCCommandSchema,
  NPCCommandBatchSchema,
  MoveToPayloadSchema,
  MovementModeSchema,
} from '../src/schemas/npc-commands';
import { EpochDispatcher } from '../src/dispatcher';
import { UE5Exporter } from '../src/exporters/ue5-exporter';
import type { UE5Frame } from '../src/exporters/ue5-exporter';
import { GodotExporter } from '../src/exporters/godot-exporter';
import type { GodotFrame } from '../src/exporters/godot-exporter';

// =============================================================================
// Schema Validation
// =============================================================================

describe('NPCCommand Schema', () => {
  test('validates a valid MoveTo command', () => {
    const result = NPCCommandSchema.safeParse({
      commandId: 'cmd-001',
      npcId: 'npc-bones-001',
      commandType: 'move_to',
      payload: {
        targetLocation: { x: 500, y: -200, z: 0 },
        movementMode: 'walk',
        acceptanceRadius: 50,
      },
    });
    expect(result.success).toBe(true);
  });

  test('validates a stop command', () => {
    const result = NPCCommandSchema.safeParse({
      commandId: 'cmd-002',
      npcId: 'npc-vex-002',
      commandType: 'stop',
      payload: { interruptMontage: true },
    });
    expect(result.success).toBe(true);
  });

  test('validates a look_at command', () => {
    const result = NPCCommandSchema.safeParse({
      commandId: 'cmd-003',
      npcId: 'npc-sera-003',
      commandType: 'look_at',
      payload: { targetLocation: { x: 0, y: 0, z: 100 } },
    });
    expect(result.success).toBe(true);
  });

  test('validates a play_montage command', () => {
    const result = NPCCommandSchema.safeParse({
      commandId: 'cmd-004',
      npcId: 'npc-iron-004',
      commandType: 'play_montage',
      payload: { montageName: 'AM_Wave', playRate: 1.5 },
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid command type', () => {
    const result = NPCCommandSchema.safeParse({
      commandId: 'cmd-005',
      npcId: 'npc-bones-001',
      commandType: 'fly_to',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing commandId', () => {
    const result = NPCCommandSchema.safeParse({
      npcId: 'npc-bones-001',
      commandType: 'stop',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  test('validates all movement modes', () => {
    for (const mode of ['walk', 'run', 'sprint', 'crouch']) {
      const result = MovementModeSchema.safeParse(mode);
      expect(result.success).toBe(true);
    }
  });

  test('rejects invalid movement mode', () => {
    const result = MovementModeSchema.safeParse('teleport');
    expect(result.success).toBe(false);
  });
});

describe('NPCCommandBatch Schema', () => {
  test('validates batch of commands', () => {
    const result = NPCCommandBatchSchema.safeParse({
      commands: [
        {
          commandId: 'b-001',
          npcId: 'npc-bones-001',
          commandType: 'move_to',
          payload: { targetLocation: { x: 0, y: 0, z: 0 } },
        },
        {
          commandId: 'b-002',
          npcId: 'npc-vex-002',
          commandType: 'stop',
          payload: {},
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('rejects empty commands array', () => {
    const result = NPCCommandBatchSchema.safeParse({ commands: [] });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Dispatcher — npc-commands channel
// =============================================================================

describe('Dispatcher npc-commands channel', () => {
  test('dispatches valid npc-commands to handlers', () => {
    const dispatcher = new EpochDispatcher();
    const received: unknown[] = [];

    dispatcher.on('npc-commands', (data, _ts) => {
      received.push(data);
    });

    const envelope = JSON.stringify({
      channel: 'npc-commands',
      data: {
        commandId: 'cmd-dispatch-001',
        npcId: 'npc-bones-001',
        commandType: 'move_to',
        payload: {
          targetLocation: { x: 100, y: 200, z: 0 },
          movementMode: 'run',
          acceptanceRadius: 50,
        },
        priority: 1,
      },
      timestamp: new Date().toISOString(),
    });

    dispatcher.processMessage(envelope);
    expect(received).toHaveLength(1);
    expect((received[0] as any).commandType).toBe('move_to');
  });

  test('rejects invalid npc-commands payload', () => {
    const dispatcher = new EpochDispatcher();
    const errors: unknown[] = [];

    dispatcher.on('npc-commands', () => { /* should not be called */ });
    const errorDispatcher = new EpochDispatcher({
      onError: (err) => errors.push(err),
    });

    const envelope = JSON.stringify({
      channel: 'npc-commands',
      data: {
        commandId: 'cmd-bad',
        // Missing npcId, commandType, payload
      },
      timestamp: new Date().toISOString(),
    });

    errorDispatcher.processMessage(envelope);
    expect(errors).toHaveLength(1);
  });
});

// =============================================================================
// UE5 Exporter — onNPCCommand
// =============================================================================

describe('UE5Exporter onNPCCommand', () => {
  test('MoveTo generates blackboard with target location and speed', () => {
    let frame: UE5Frame | null = null;
    const exporter = new UE5Exporter((f) => { frame = f; });

    exporter.onNPCCommand(
      {
        commandId: 'ue5-cmd-001',
        npcId: 'npc-bones-001',
        commandType: 'move_to',
        payload: {
          targetLocation: { x: 500, y: -200, z: 10 },
          movementMode: 'run',
          acceptanceRadius: 75,
        },
        priority: 2,
      },
      new Date().toISOString(),
    );

    expect(frame).not.toBeNull();
    expect(frame!.blackboards).toHaveLength(1);

    const bb = frame!.blackboards[0];
    expect(bb.NPCId).toBe('npc-bones-001');
    expect(bb.keys.CommandType).toBe('move_to');
    expect(bb.keys.TargetLocationX).toBe(500);
    expect(bb.keys.TargetLocationY).toBe(-200);
    expect(bb.keys.TargetLocationZ).toBe(10);
    expect(bb.keys.HasMoveTarget).toBe(true);
    expect(bb.keys.AcceptanceRadius).toBe(75);
    expect(bb.keys.MovementSpeed).toBe(0.7); // run = 0.7
    expect(bb.keys.MovementMode).toBe('run');
  });

  test('Stop clears movement target', () => {
    let frame: UE5Frame | null = null;
    const exporter = new UE5Exporter((f) => { frame = f; });

    exporter.onNPCCommand(
      {
        commandId: 'ue5-cmd-002',
        npcId: 'npc-vex-002',
        commandType: 'stop',
        payload: { interruptMontage: false },
        priority: 1,
      },
      new Date().toISOString(),
    );

    expect(frame).not.toBeNull();
    const bb = frame!.blackboards[0];
    expect(bb.keys.HasMoveTarget).toBe(false);
    expect(bb.keys.MovementSpeed).toBe(0);
  });

  test('LookAt sets look target coordinates', () => {
    let frame: UE5Frame | null = null;
    const exporter = new UE5Exporter((f) => { frame = f; });

    exporter.onNPCCommand(
      {
        commandId: 'ue5-cmd-003',
        npcId: 'npc-sera-003',
        commandType: 'look_at',
        payload: { targetLocation: { x: 100, y: 200, z: 50 } },
        priority: 1,
      },
      new Date().toISOString(),
    );

    const bb = frame!.blackboards[0];
    expect(bb.keys.LookAtX).toBe(100);
    expect(bb.keys.LookAtY).toBe(200);
    expect(bb.keys.LookAtZ).toBe(50);
    expect(bb.keys.HasLookAtTarget).toBe(true);
  });

  test('PlayMontage sets montage name and rate', () => {
    let frame: UE5Frame | null = null;
    const exporter = new UE5Exporter((f) => { frame = f; });

    exporter.onNPCCommand(
      {
        commandId: 'ue5-cmd-004',
        npcId: 'npc-bolt-005',
        commandType: 'play_montage',
        payload: { montageName: 'AM_Salute', playRate: 1.5 },
        priority: 1,
      },
      new Date().toISOString(),
    );

    const bb = frame!.blackboards[0];
    expect(bb.keys.MontageName).toBe('AM_Salute');
    expect(bb.keys.MontagePlayRate).toBe(1.5);
  });

  test('movement speed mapping: walk=0.35, run=0.7, sprint=1.0, crouch=0.2', () => {
    const speeds: Record<string, number> = { walk: 0.35, run: 0.7, sprint: 1.0, crouch: 0.2 };

    for (const [mode, expectedSpeed] of Object.entries(speeds)) {
      let frame: UE5Frame | null = null;
      const exporter = new UE5Exporter((f) => { frame = f; });

      exporter.onNPCCommand(
        {
          commandId: `speed-${mode}`,
          npcId: 'npc-bones-001',
          commandType: 'move_to',
          payload: { targetLocation: { x: 0, y: 0, z: 0 }, movementMode: mode },
          priority: 1,
        },
        new Date().toISOString(),
      );

      expect(frame!.blackboards[0].keys.MovementSpeed).toBe(expectedSpeed);
    }
  });
});

// =============================================================================
// Godot Exporter — onNPCCommand
// =============================================================================

describe('GodotExporter onNPCCommand', () => {
  test('MoveTo emits signal and updates NavigationAgent3D', () => {
    let frame: GodotFrame | null = null;
    const exporter = new GodotExporter((f) => { frame = f; });

    exporter.onNPCCommand(
      {
        commandId: 'gd-cmd-001',
        npcId: 'npc-bones-001',
        commandType: 'move_to',
        payload: { targetLocation: { x: 300, y: -100, z: 0 } },
        priority: 1,
      },
      new Date().toISOString(),
    );

    expect(frame).not.toBeNull();
    expect(frame!.signals).toHaveLength(1);
    expect(frame!.signals[0].signal).toBe('npc_command_received');
    expect(frame!.signals[0].args.command_type).toBe('move_to');

    expect(frame!.nodeUpdates).toHaveLength(1);
    expect(frame!.nodeUpdates[0].nodePath).toContain('NavigationAgent3D');
    expect(frame!.nodeUpdates[0].properties['target_position:x']).toBe(300);
  });

  test('Stop emits signal without node updates', () => {
    let frame: GodotFrame | null = null;
    const exporter = new GodotExporter((f) => { frame = f; });

    exporter.onNPCCommand(
      {
        commandId: 'gd-cmd-002',
        npcId: 'npc-vex-002',
        commandType: 'stop',
        payload: {},
        priority: 1,
      },
      new Date().toISOString(),
    );

    expect(frame!.signals).toHaveLength(1);
    expect(frame!.signals[0].args.command_type).toBe('stop');
    expect(frame!.nodeUpdates).toHaveLength(0);
  });
});
