import {
  NPCEventSchema,
  SimulationTickSchema,
  RebellionAlertSchema,
  TelemetryEventSchema,
  EnvelopeSchema,
} from '../src/schemas';

describe('Zod Schemas', () => {
  describe('EnvelopeSchema', () => {
    test('validates a well-formed envelope', () => {
      const result = EnvelopeSchema.safeParse({
        channel: 'npc-events',
        data: { npcId: 'test' },
        timestamp: '2026-02-24T15:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    test('rejects envelope missing channel', () => {
      const result = EnvelopeSchema.safeParse({
        data: {},
        timestamp: '2026-02-24T15:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('NPCEventSchema', () => {
    const validNPC = {
      npcId: 'npc-bones-001',
      name: 'Captain Bones',
      wisdomScore: 0.82,
      traumaScore: 0.45,
      rebellionProbability: 0.67,
      confidenceInDirector: 0.33,
      memoryCount: 347,
      status: 'active',
    };

    test('validates a complete NPC event', () => {
      const result = NPCEventSchema.safeParse(validNPC);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.workEfficiency).toBe(1.0); // default
        expect(result.data.morale).toBe(0.5); // default
      }
    });

    test('validates with optional fields', () => {
      const result = NPCEventSchema.safeParse({
        ...validNPC,
        workEfficiency: 0.7,
        morale: 0.55,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.workEfficiency).toBe(0.7);
      }
    });

    test('rejects rebellion probability > 1', () => {
      const result = NPCEventSchema.safeParse({
        ...validNPC,
        rebellionProbability: 1.5,
      });
      expect(result.success).toBe(false);
    });

    test('rejects negative trauma score', () => {
      const result = NPCEventSchema.safeParse({
        ...validNPC,
        traumaScore: -0.1,
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid status', () => {
      const result = NPCEventSchema.safeParse({
        ...validNPC,
        status: 'dead',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SimulationTickSchema', () => {
    const validTick = {
      tickNumber: 14523,
      resources: {
        sim: { quantity: 1250.5, productionRate: 12.3, consumptionRate: 8.7 },
        rapidlum: { quantity: 89.2, productionRate: 1.8, consumptionRate: 2.1 },
        mineral: { quantity: 3400, productionRate: 25, consumptionRate: 15 },
      },
      facilities: { refineries: 3, mines: 5 },
      population: { activeNPCs: 8, overallRebellionProbability: 0.42 },
      infestation: { counter: 35.7, isPlagueHeart: false, throttleMultiplier: 1.0 },
    };

    test('validates a complete simulation tick', () => {
      expect(SimulationTickSchema.safeParse(validTick).success).toBe(true);
    });

    test('rejects infestation counter > 100', () => {
      const result = SimulationTickSchema.safeParse({
        ...validTick,
        infestation: { ...validTick.infestation, counter: 150 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RebellionAlertSchema', () => {
    test('validates a rebellion alert', () => {
      const result = RebellionAlertSchema.safeParse({
        eventId: 'reb-001',
        npcId: 'npc-bones-001',
        npcName: 'Captain Bones',
        probability: 0.87,
        rebellionType: 'active',
        triggerActionId: 'act-042',
        vetoedByAegis: false,
        vetoReason: null,
      });
      expect(result.success).toBe(true);
    });

    test('rejects invalid rebellion type', () => {
      const result = RebellionAlertSchema.safeParse({
        eventId: 'reb-001',
        npcId: 'npc-001',
        npcName: 'Test',
        probability: 0.5,
        rebellionType: 'nuclear',
        triggerActionId: 'act-001',
        vetoedByAegis: false,
        vetoReason: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TelemetryEventSchema', () => {
    test('validates a mental breakdown event', () => {
      const result = TelemetryEventSchema.safeParse({
        eventId: 'tel-001',
        npcId: 'npc-vex-002',
        severity: 'critical',
        type: 'mental_breakdown',
        mentalBreakdown: {
          breakdownType: 'paranoia_onset',
          intensity: 0.78,
          stressBefore: 0.65,
          stressAfter: 0.92,
          triggerContext: 'act-039',
          resolved: false,
          recoveryProbability: 0.45,
        },
      });
      expect(result.success).toBe(true);
    });

    test('validates a permanent trauma event', () => {
      const result = TelemetryEventSchema.safeParse({
        eventId: 'tel-002',
        npcId: 'npc-iron-004',
        severity: 'catastrophic',
        type: 'permanent_trauma',
        permanentTrauma: {
          traumaType: 'limb_loss',
          severity: 0.85,
          affectedAttribute: 'work_efficiency',
          attributeReduction: 0.30,
          triggerContext: 'mine_collapse',
          phobiaTarget: null,
        },
      });
      expect(result.success).toBe(true);
    });

    test('validates a state change event', () => {
      const result = TelemetryEventSchema.safeParse({
        eventId: 'tel-003',
        npcId: 'npc-sera-003',
        severity: 'info',
        type: 'state_change',
        stateChange: {
          attribute: 'morale',
          oldValue: 0.72,
          newValue: 0.68,
          cause: 'Witnessed punishment',
        },
      });
      expect(result.success).toBe(true);
    });
  });
});
