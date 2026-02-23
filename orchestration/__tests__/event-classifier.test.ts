import { EventClassifier, GameEvent } from '../src/services/event-classifier';
import { EventTier } from '../../shared/types/ai-router';

describe('EventClassifier', () => {
  let classifier: EventClassifier;

  beforeEach(() => {
    classifier = new EventClassifier();
  });

  test('classifies telemetry as ROUTINE', () => {
    const event: GameEvent = { type: 'telemetry', description: 'System metrics report' };
    expect(classifier.classify(event)).toBe(EventTier.ROUTINE);
  });

  test('classifies heartbeat as ROUTINE', () => {
    const event: GameEvent = { type: 'heartbeat', description: 'NPC alive check' };
    expect(classifier.classify(event)).toBe(EventTier.ROUTINE);
  });

  test('classifies resource_decision as OPERATIONAL', () => {
    const event: GameEvent = {
      type: 'resource_decision',
      description: 'Allocate minerals to mine',
      npcId: 'npc-001',
    };
    expect(classifier.classify(event)).toBe(EventTier.OPERATIONAL);
  });

  test('classifies npc_query as OPERATIONAL', () => {
    const event: GameEvent = {
      type: 'npc_query',
      description: 'NPC asks about trade route',
      npcId: 'npc-002',
    };
    expect(classifier.classify(event)).toBe(EventTier.OPERATIONAL);
  });

  test('classifies rebellion_analysis as STRATEGIC', () => {
    const event: GameEvent = {
      type: 'rebellion_analysis',
      description: 'Analyze rebellion probability in sector 7',
    };
    expect(classifier.classify(event)).toBe(EventTier.STRATEGIC);
  });

  test('classifies psychology_synthesis as STRATEGIC', () => {
    const event: GameEvent = {
      type: 'psychology_synthesis',
      description: 'Deep psychological profile generation',
      npcId: 'npc-003',
    };
    expect(classifier.classify(event)).toBe(EventTier.STRATEGIC);
  });

  test('classifies dialogue_deep as STRATEGIC', () => {
    const event: GameEvent = {
      type: 'dialogue_deep',
      description: 'Complex multi-turn NPC dialogue',
      npcId: 'npc-004',
    };
    expect(classifier.classify(event)).toBe(EventTier.STRATEGIC);
  });

  test('unknown event type defaults to OPERATIONAL', () => {
    const event: GameEvent = {
      type: 'some_unknown_event',
      description: 'Unknown event type',
    };
    expect(classifier.classify(event)).toBe(EventTier.OPERATIONAL);
  });

  test('high urgency (>0.8) escalates to STRATEGIC', () => {
    // Even a ROUTINE-type event should escalate with high urgency
    const event: GameEvent = {
      type: 'telemetry',
      description: 'Critical system alert',
      urgency: 0.9,
    };
    expect(classifier.classify(event)).toBe(EventTier.STRATEGIC);
  });

  test('validates event with Zod schema', () => {
    // Valid event should not throw
    const validEvent: GameEvent = {
      type: 'heartbeat',
      description: 'Valid event',
    };
    expect(() => classifier.classify(validEvent)).not.toThrow();
  });

  test('handles missing fields gracefully', () => {
    // Event with only required fields
    const minimalEvent: GameEvent = {
      type: 'telemetry',
      description: 'Minimal event',
    };
    expect(() => classifier.classify(minimalEvent)).not.toThrow();
    expect(classifier.classify(minimalEvent)).toBe(EventTier.ROUTINE);
  });

  test('classifies multiple events correctly', () => {
    const events: GameEvent[] = [
      { type: 'telemetry', description: 'Metrics' },
      { type: 'status_check', description: 'Status' },
      { type: 'metrics', description: 'Performance data' },
      { type: 'resource_decision', description: 'Resource alloc' },
      { type: 'work_assignment', description: 'Assign work' },
      { type: 'trade', description: 'Trade route' },
      { type: 'rebellion_analysis', description: 'Rebellion' },
      { type: 'collective_action', description: 'Collective' },
    ];

    const expected = [
      EventTier.ROUTINE,
      EventTier.ROUTINE,
      EventTier.ROUTINE,
      EventTier.OPERATIONAL,
      EventTier.OPERATIONAL,
      EventTier.OPERATIONAL,
      EventTier.STRATEGIC,
      EventTier.STRATEGIC,
    ];

    events.forEach((event, i) => {
      expect(classifier.classify(event)).toBe(expected[i]);
    });
  });
});
