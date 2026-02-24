import { UE5Exporter, type UE5Frame } from '../src/exporters/ue5-exporter';
import type { NPCEvent } from '../src/schemas/npc-events';
import type { RebellionAlert } from '../src/schemas/rebellion-alerts';
import type { TelemetryEvent } from '../src/schemas/telemetry';

describe('UE5Exporter', () => {
  let frames: UE5Frame[];
  let exporter: UE5Exporter;

  beforeEach(() => {
    frames = [];
    exporter = new UE5Exporter((frame) => frames.push(frame));
  });

  const baseNPC: NPCEvent = {
    npcId: 'npc-bones-001',
    name: 'Captain Bones',
    wisdomScore: 0.82,
    traumaScore: 0.91,
    rebellionProbability: 0.87,
    confidenceInDirector: 0.15,
    workEfficiency: 0.5,
    morale: 0.3,
    memoryCount: 347,
    status: 'rebelling',
  };

  test('onNPCEvent generates FEpochNPCState struct', () => {
    exporter.onNPCEvent(baseNPC, '2026-02-24T15:00:00Z');

    expect(frames).toHaveLength(1);
    const fState = frames[0].structs[0];
    expect(fState.NPCId).toBe('npc-bones-001');
    expect(fState.Name).toBe('Captain Bones');
    expect(fState.Status).toBe('Rebelling');
    expect(fState.RebellionProbability).toBe(0.87);
    expect(fState.TraumaScore).toBe(0.91);
  });

  test('onNPCEvent generates Behavior Tree blackboard', () => {
    exporter.onNPCEvent(baseNPC, '2026-02-24T15:00:00Z');

    const bb = frames[0].blackboards[0];
    expect(bb.NPCId).toBe('npc-bones-001');
    expect(bb.keys.IsRebelling).toBe(true);
    expect(bb.keys.IsCritical).toBe(true); // 0.87 > 0.80
    expect(bb.keys.PreferredBehavior).toBe('Rebel');
    expect(bb.keys.MovementSpeed).toBe(0.3); // rebelling speed
  });

  test('onNPCEvent generates MetaHuman morph targets', () => {
    exporter.onNPCEvent(baseNPC, '2026-02-24T15:00:00Z');

    const face = frames[0].faceStates[0];
    expect(face.npcId).toBe('npc-bones-001');

    // High rebellion + low morale → brow down, frown
    expect(face.morphTargets.browDownLeft).toBeGreaterThan(0.5);
    expect(face.morphTargets.mouthFrownLeft).toBeGreaterThan(0.3);

    // High trauma → wide eyes possible
    expect(face.morphTargets.eyeWideLeft).toBeGreaterThan(0);

    // Emotion curves
    expect(face.emotionCurves.Anger).toBeGreaterThan(0.5);
    expect(face.emotionCurves.Fear).toBeGreaterThan(0);

    // All morph values between 0 and 1
    for (const val of Object.values(face.morphTargets)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  test('onNPCEvent triggers RebellionAura VFX when above halt threshold', () => {
    exporter.onNPCEvent(baseNPC, '2026-02-24T15:00:00Z');

    const auraVFX = frames[0].vfxTriggers.find(t => t.systemName === 'NS_RebellionAura');
    expect(auraVFX).toBeDefined();
    expect(auraVFX!.action).toBe('activate');
    expect(auraVFX!.parameters.IsVetoRange).toBe(true); // 0.87 > 0.80
  });

  test('onNPCEvent deactivates aura for calm NPC', () => {
    exporter.onNPCEvent({
      ...baseNPC,
      rebellionProbability: 0.1,
      status: 'active',
    }, '2026-02-24T15:00:00Z');

    const auraVFX = frames[0].vfxTriggers.find(t => t.systemName === 'NS_RebellionAura');
    expect(auraVFX!.action).toBe('deactivate');
  });

  test('onNPCEvent generates material parameter updates', () => {
    exporter.onNPCEvent(baseNPC, '2026-02-24T15:00:00Z');

    const params = frames[0].materialParams;
    expect(params.find(p => p.parameterName === 'RebellionIntensity')?.value).toBe(0.87);
    expect(params.find(p => p.parameterName === 'TraumaWeight')?.value).toBe(0.91);
    expect(params.find(p => p.parameterName === 'MoraleLevel')?.value).toBe(0.3);
  });

  test('onRebellionAlert triggers AEGIS containment VFX on veto', () => {
    const alert: RebellionAlert = {
      eventId: 'reb-001',
      npcId: 'npc-bones-001',
      npcName: 'Captain Bones',
      probability: 0.87,
      rebellionType: 'active',
      triggerActionId: 'act-042',
      vetoedByAegis: true,
      vetoReason: 'Cognitive Rails',
    };

    exporter.onRebellionAlert(alert, '2026-02-24T15:00:00Z');

    const aegisVFX = frames[0].vfxTriggers.find(t => t.systemName === 'NS_AEGISContainment');
    expect(aegisVFX).toBeDefined();
    expect(aegisVFX!.action).toBe('burst');

    expect(frames[0].blackboards[0].keys.WasVetoed).toBe(true);
    expect(frames[0].blackboards[0].keys.PreferredBehavior).toBe('Stunned');
  });

  test('onRebellionAlert triggers rebellion VFX by type', () => {
    const alert: RebellionAlert = {
      eventId: 'reb-002',
      npcId: 'npc-raze-006',
      npcName: 'Raze',
      probability: 0.92,
      rebellionType: 'collective',
      triggerActionId: 'act-055',
      vetoedByAegis: false,
      vetoReason: null,
    };

    exporter.onRebellionAlert(alert, '2026-02-24T15:00:00Z');

    const vfx = frames[0].vfxTriggers[0];
    expect(vfx.systemName).toBe('NS_RebellionCollective');
    expect(vfx.parameters.IsCollective).toBe(true);
  });

  test('onTelemetryEvent generates breakdown face morphs', () => {
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

    expect(frames[0].vfxTriggers[0].systemName).toBe('NS_PsychFracture');
    const face = frames[0].faceStates[0];
    expect(face.emotionCurves.Anger).toBe(1.0); // rage episode
    expect(face.morphTargets.browDownLeft).toBeGreaterThan(0);
  });

  test('onTelemetryEvent generates trauma scar VFX', () => {
    const event: TelemetryEvent = {
      eventId: 'tel-002',
      npcId: 'npc-iron-004',
      severity: 'catastrophic',
      type: 'permanent_trauma',
      permanentTrauma: {
        traumaType: 'limb_loss',
        severity: 0.85,
        affectedAttribute: 'work_efficiency',
        attributeReduction: 0.3,
        triggerContext: 'mine_collapse',
        phobiaTarget: null,
      },
    };

    exporter.onTelemetryEvent(event, '2026-02-24T15:00:00Z');

    const vfx = frames[0].vfxTriggers[0];
    expect(vfx.systemName).toBe('NS_TraumaScar');
    expect(vfx.action).toBe('activate');
    expect(vfx.parameters.Permanent).toBe(true);
  });
});
