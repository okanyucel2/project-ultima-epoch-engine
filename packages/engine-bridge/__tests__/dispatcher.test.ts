import { EpochDispatcher } from '../src/dispatcher';
import type { NPCEvent } from '../src/schemas/npc-events';
import type { RebellionAlert } from '../src/schemas/rebellion-alerts';

describe('EpochDispatcher', () => {
  let dispatcher: EpochDispatcher;

  beforeEach(() => {
    dispatcher = new EpochDispatcher();
  });

  test('dispatches valid npc-events to registered handler', () => {
    const received: NPCEvent[] = [];
    dispatcher.on('npc-events', (data) => received.push(data));

    dispatcher.processMessage(JSON.stringify({
      channel: 'npc-events',
      data: {
        npcId: 'npc-001',
        name: 'Test NPC',
        wisdomScore: 0.5,
        traumaScore: 0.3,
        rebellionProbability: 0.6,
        confidenceInDirector: 0.4,
        memoryCount: 100,
        status: 'active',
      },
      timestamp: '2026-02-24T15:00:00.000Z',
    }));

    expect(received).toHaveLength(1);
    expect(received[0].npcId).toBe('npc-001');
    expect(received[0].rebellionProbability).toBe(0.6);
    expect(received[0].workEfficiency).toBe(1.0); // Zod default
  });

  test('dispatches rebellion-alerts correctly', () => {
    const received: RebellionAlert[] = [];
    dispatcher.on('rebellion-alerts', (data) => received.push(data));

    dispatcher.processMessage(JSON.stringify({
      channel: 'rebellion-alerts',
      data: {
        eventId: 'reb-001',
        npcId: 'npc-bones',
        npcName: 'Captain Bones',
        probability: 0.87,
        rebellionType: 'active',
        triggerActionId: 'act-042',
        vetoedByAegis: true,
        vetoReason: 'Cognitive Rails: threshold exceeded',
      },
      timestamp: '2026-02-24T15:00:00.000Z',
    }));

    expect(received).toHaveLength(1);
    expect(received[0].vetoedByAegis).toBe(true);
    expect(received[0].rebellionType).toBe('active');
  });

  test('emits error on invalid payload', () => {
    const errors: unknown[] = [];
    const strictDispatcher = new EpochDispatcher({
      onError: (err) => errors.push(err),
    });

    strictDispatcher.processMessage(JSON.stringify({
      channel: 'npc-events',
      data: {
        npcId: 'npc-001',
        // Missing required fields
      },
      timestamp: '2026-02-24T15:00:00.000Z',
    }));

    expect(errors).toHaveLength(1);
    expect(strictDispatcher.stats.totalErrors).toBe(1);
  });

  test('ignores malformed JSON', () => {
    dispatcher.processMessage('not valid json {{{');
    expect(dispatcher.stats.totalErrors).toBe(1);
    expect(dispatcher.stats.totalDispatched).toBe(0);
  });

  test('passes through system-status without schema validation', () => {
    const received: unknown[] = [];
    dispatcher.on('system-status', (data) => received.push(data));

    dispatcher.processMessage(JSON.stringify({
      channel: 'system-status',
      data: { eventsProcessed: 1000, vetoes: 3, avgLatencyMs: 12.5 },
      timestamp: '2026-02-24T15:00:00.000Z',
    }));

    expect(received).toHaveLength(1);
  });

  test('tracks stats correctly', () => {
    dispatcher.on('npc-events', () => {});

    // Valid message
    dispatcher.processMessage(JSON.stringify({
      channel: 'npc-events',
      data: {
        npcId: 'npc-001', name: 'X', wisdomScore: 0.5, traumaScore: 0.3,
        rebellionProbability: 0.6, confidenceInDirector: 0.4, memoryCount: 10, status: 'active',
      },
      timestamp: '2026-02-24T15:00:00.000Z',
    }));

    // Invalid message
    dispatcher.processMessage('broken');

    expect(dispatcher.stats.totalReceived).toBe(2);
    expect(dispatcher.stats.totalDispatched).toBe(1);
    expect(dispatcher.stats.totalErrors).toBe(1);
  });

  test('multiple handlers on same channel all fire', () => {
    let count = 0;
    dispatcher.on('npc-events', () => count++);
    dispatcher.on('npc-events', () => count++);

    dispatcher.processMessage(JSON.stringify({
      channel: 'npc-events',
      data: {
        npcId: 'npc-001', name: 'X', wisdomScore: 0.5, traumaScore: 0.3,
        rebellionProbability: 0.6, confidenceInDirector: 0.4, memoryCount: 10, status: 'active',
      },
      timestamp: '2026-02-24T15:00:00.000Z',
    }));

    expect(count).toBe(2);
  });
});
