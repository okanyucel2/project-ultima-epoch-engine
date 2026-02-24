import { GodotExporter, type GodotFrame } from '../src/exporters/godot-exporter';
import type { NPCEvent } from '../src/schemas/npc-events';
import type { RebellionAlert } from '../src/schemas/rebellion-alerts';
import type { TelemetryEvent } from '../src/schemas/telemetry';

describe('GodotExporter', () => {
  let frames: GodotFrame[];
  let exporter: GodotExporter;

  beforeEach(() => {
    frames = [];
    exporter = new GodotExporter((frame) => frames.push(frame));
  });

  const baseNPC: NPCEvent = {
    npcId: 'npc-bones-001',
    name: 'Captain Bones',
    wisdomScore: 0.82,
    traumaScore: 0.45,
    rebellionProbability: 0.67,
    confidenceInDirector: 0.33,
    workEfficiency: 0.7,
    morale: 0.55,
    memoryCount: 347,
    status: 'active',
  };

  test('onNPCEvent emits GDScript signals', () => {
    exporter.onNPCEvent(baseNPC, '2026-02-24T15:00:00Z');

    expect(frames).toHaveLength(1);
    const frame = frames[0];

    // Signal
    expect(frame.signals).toHaveLength(1);
    expect(frame.signals[0].signal).toBe('npc_state_updated');
    expect(frame.signals[0].args.npc_id).toBe('npc-bones-001');
    expect(frame.signals[0].args.rebellion_probability).toBe(0.67);
  });

  test('onNPCEvent generates AnimationTree params', () => {
    exporter.onNPCEvent(baseNPC, '2026-02-24T15:00:00Z');

    const params = frames[0].animationParams['npc-bones-001'];
    expect(params).toBeDefined();
    expect(params.stateMachineState).toBe('agitated'); // 0.67 > HALT
    expect(params.rebellionIntensity).toBe(0.67);
    expect(params.blendPosition).toHaveLength(2);
    expect(params.speedScale).toBeGreaterThan(0);
    expect(params.speedScale).toBeLessThanOrEqual(1);
  });

  test('onNPCEvent sets rebel state for rebelling NPC', () => {
    exporter.onNPCEvent({ ...baseNPC, status: 'rebelling', rebellionProbability: 0.92 }, '2026-02-24T15:00:00Z');

    const params = frames[0].animationParams['npc-bones-001'];
    expect(params.stateMachineState).toBe('rebel');
    expect(params.speedScale).toBe(0.3);
  });

  test('onNPCEvent generates node property updates', () => {
    exporter.onNPCEvent(baseNPC, '2026-02-24T15:00:00Z');

    expect(frames[0].nodeUpdates.length).toBeGreaterThanOrEqual(2);
    const npcUpdate = frames[0].nodeUpdates[0];
    expect(npcUpdate.nodePath).toBe('/root/World/NPCs/npc-bones-001');
    expect(npcUpdate.properties['npc_data/rebellion_probability']).toBe(0.67);
  });

  test('onNPCEvent shows rebellion aura when above halt threshold', () => {
    exporter.onNPCEvent(baseNPC, '2026-02-24T15:00:00Z');

    const auraUpdate = frames[0].nodeUpdates.find(u => u.nodePath.includes('RebellionAura'));
    expect(auraUpdate).toBeDefined();
    expect(auraUpdate!.properties.visible).toBe(true); // 0.67 > 0.35
  });

  test('onRebellionAlert emits rebellion_triggered signal', () => {
    const alert: RebellionAlert = {
      eventId: 'reb-001',
      npcId: 'npc-bones-001',
      npcName: 'Captain Bones',
      probability: 0.87,
      rebellionType: 'active',
      triggerActionId: 'act-042',
      vetoedByAegis: false,
      vetoReason: null,
    };

    exporter.onRebellionAlert(alert, '2026-02-24T15:00:00Z');

    expect(frames[0].signals[0].signal).toBe('rebellion_triggered');
    expect(frames[0].animationParams['npc-bones-001'].stateMachineState).toBe('rebel');
  });

  test('onRebellionAlert emits aegis_veto_fired when vetoed', () => {
    const alert: RebellionAlert = {
      eventId: 'reb-002',
      npcId: 'npc-bones-001',
      npcName: 'Captain Bones',
      probability: 0.87,
      rebellionType: 'active',
      triggerActionId: 'act-042',
      vetoedByAegis: true,
      vetoReason: 'Cognitive Rails',
    };

    exporter.onRebellionAlert(alert, '2026-02-24T15:00:00Z');

    expect(frames[0].signals[0].signal).toBe('aegis_veto_fired');
    const shieldUpdate = frames[0].nodeUpdates.find(u => u.nodePath.includes('AEGISShield'));
    expect(shieldUpdate).toBeDefined();
  });

  test('onTelemetryEvent handles mental breakdown', () => {
    const event: TelemetryEvent = {
      eventId: 'tel-001',
      npcId: 'npc-vex-002',
      severity: 'critical',
      type: 'mental_breakdown',
      mentalBreakdown: {
        breakdownType: 'rage_episode',
        intensity: 0.9,
        stressBefore: 0.7,
        stressAfter: 0.95,
        triggerContext: 'act-039',
        resolved: false,
        recoveryProbability: 0.3,
      },
    };

    exporter.onTelemetryEvent(event, '2026-02-24T15:00:00Z');

    expect(frames[0].signals[0].signal).toBe('mental_breakdown');
    expect(frames[0].signals[0].args.breakdown_type).toBe('rage_episode');
  });
});
