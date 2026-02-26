// =============================================================================
// NPC Commands Tests — POST /api/v1/npc/command (Wave 50)
// =============================================================================

import { createApp } from '../src/index';
import type { AppInstance } from '../src/index';
import request from 'supertest';

describe('POST /api/v1/npc/command', () => {
  let appInstance: AppInstance;

  beforeAll(() => {
    appInstance = createApp({ mockMode: true });
  });

  afterAll(async () => {
    await appInstance.wsServer.close();
  });

  // ---------------------------------------------------------------------------
  // MoveTo commands
  // ---------------------------------------------------------------------------
  test('accepts valid MoveTo command for known NPC', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command')
      .send({
        commandId: 'cmd-001',
        npcId: 'npc-bones-001',
        commandType: 'move_to',
        payload: {
          targetLocation: { x: 500, y: -200, z: 0 },
          movementMode: 'walk',
          acceptanceRadius: 50,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.commandId).toBe('cmd-001');
    expect(res.body.npcName).toBe('Captain Bones');
  });

  test('accepts MoveTo with run movement mode', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command')
      .send({
        commandId: 'cmd-002',
        npcId: 'npc-vex-002',
        commandType: 'move_to',
        payload: {
          targetLocation: { x: 100, y: 300, z: 0 },
          movementMode: 'run',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.npcName).toBe('Vex');
  });

  // ---------------------------------------------------------------------------
  // Stop command
  // ---------------------------------------------------------------------------
  test('accepts stop command', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command')
      .send({
        commandId: 'cmd-003',
        npcId: 'npc-sera-003',
        commandType: 'stop',
        payload: { interruptMontage: false },
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.commandType).toBe('stop');
  });

  // ---------------------------------------------------------------------------
  // LookAt command
  // ---------------------------------------------------------------------------
  test('accepts look_at command', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command')
      .send({
        commandId: 'cmd-004',
        npcId: 'npc-iron-004',
        commandType: 'look_at',
        payload: { targetLocation: { x: 0, y: 0, z: 100 } },
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // PlayMontage command
  // ---------------------------------------------------------------------------
  test('accepts play_montage command', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command')
      .send({
        commandId: 'cmd-005',
        npcId: 'npc-bolt-005',
        commandType: 'play_montage',
        payload: { montageName: 'AM_Salute', playRate: 1.0 },
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------
  test('rejects command for unknown NPC with 404', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command')
      .send({
        commandId: 'cmd-err-001',
        npcId: 'npc-nonexistent',
        commandType: 'move_to',
        payload: { targetLocation: { x: 0, y: 0, z: 0 } },
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Unknown NPC');
    expect(res.body.knownNPCs).toBeDefined();
    expect(res.body.knownNPCs.length).toBe(6);
  });

  test('rejects invalid command type with 400', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command')
      .send({
        commandId: 'cmd-err-002',
        npcId: 'npc-bones-001',
        commandType: 'fly_to', // Invalid
        payload: {},
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid NPC command');
  });

  test('rejects command missing required fields with 400', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command')
      .send({
        npcId: 'npc-bones-001',
        // Missing commandId, commandType
      });

    expect(res.status).toBe(400);
  });

  test('rejects empty body with 400', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command')
      .send({});

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Batch Commands — POST /api/v1/npc/command/batch
// =============================================================================

describe('POST /api/v1/npc/command/batch', () => {
  let appInstance: AppInstance;

  beforeAll(() => {
    appInstance = createApp({ mockMode: true });
  });

  afterAll(async () => {
    await appInstance.wsServer.close();
  });

  test('accepts batch of valid commands for multiple NPCs', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command/batch')
      .send({
        commands: [
          {
            commandId: 'batch-001',
            npcId: 'npc-bones-001',
            commandType: 'move_to',
            payload: { targetLocation: { x: 500, y: 0, z: 0 } },
          },
          {
            commandId: 'batch-002',
            npcId: 'npc-vex-002',
            commandType: 'move_to',
            payload: { targetLocation: { x: -300, y: 100, z: 0 } },
          },
          {
            commandId: 'batch-003',
            npcId: 'npc-sera-003',
            commandType: 'move_to',
            payload: { targetLocation: { x: 0, y: 200, z: 0 } },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.accepted).toBe(3);
    expect(res.body.rejected).toBe(0);
  });

  test('partial success — some unknown NPCs in batch', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command/batch')
      .send({
        commands: [
          {
            commandId: 'batch-ok',
            npcId: 'npc-bones-001',
            commandType: 'move_to',
            payload: { targetLocation: { x: 100, y: 0, z: 0 } },
          },
          {
            commandId: 'batch-fail',
            npcId: 'npc-unknown',
            commandType: 'stop',
            payload: {},
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.accepted).toBe(1);
    expect(res.body.rejected).toBe(1);
    expect(res.body.results[1].error).toBe('Unknown NPC');
  });

  test('rejects empty command array', async () => {
    const res = await request(appInstance.app)
      .post('/api/v1/npc/command/batch')
      .send({ commands: [] });

    expect(res.status).toBe(400);
  });

  test('all 6 NPCs can receive simultaneous move commands', async () => {
    const commands = [
      'npc-bones-001', 'npc-vex-002', 'npc-sera-003',
      'npc-iron-004', 'npc-bolt-005', 'npc-shade-006',
    ].map((npcId, i) => ({
      commandId: `all-move-${i}`,
      npcId,
      commandType: 'move_to' as const,
      payload: { targetLocation: { x: i * 100, y: i * 50, z: 0 } },
    }));

    const res = await request(appInstance.app)
      .post('/api/v1/npc/command/batch')
      .send({ commands });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.accepted).toBe(6);
    expect(res.body.rejected).toBe(0);
  });
});
