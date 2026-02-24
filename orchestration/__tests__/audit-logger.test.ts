import { AuditLogger } from '../src/services/audit-logger';
import {
  EventTier,
  ProviderType,
  CircuitState,
  AuditLogEntry,
  RoutingDecision,
} from '@epoch/shared/ai-router';
import { createTimestamp } from '@epoch/shared/common';
import { v4 as uuidv4 } from 'uuid';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  const now = createTimestamp();
  const decision: RoutingDecision = {
    eventTier: EventTier.ROUTINE,
    selectedProvider: ProviderType.OPENAI,
    selectedModel: 'gpt-4o-mini',
    failoverOccurred: false,
    latencyMs: 50,
    timestamp: now,
  };

  return {
    id: uuidv4(),
    decision,
    inputTokens: 100,
    outputTokens: 50,
    estimatedCost: 0.001,
    circuitState: CircuitState.CLOSED,
    eventDescription: 'Test event',
    timestamp: now,
    ...overrides,
  };
}

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger(1000);
  });

  test('logs entries and retrieves them', () => {
    const entry = makeEntry();
    logger.log(entry);

    const recent = logger.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe(entry.id);
  });

  test('getRecent returns entries in reverse chronological order', () => {
    const entry1 = makeEntry({ id: 'first' });
    const entry2 = makeEntry({ id: 'second' });
    const entry3 = makeEntry({ id: 'third' });

    logger.log(entry1);
    logger.log(entry2);
    logger.log(entry3);

    const recent = logger.getRecent(3);
    expect(recent[0].id).toBe('third');
    expect(recent[1].id).toBe('second');
    expect(recent[2].id).toBe('first');
  });

  test('getRecent limits count', () => {
    for (let i = 0; i < 10; i++) {
      logger.log(makeEntry());
    }

    const recent = logger.getRecent(3);
    expect(recent).toHaveLength(3);
  });

  test('ring buffer overwrites oldest when full', () => {
    const smallLogger = new AuditLogger(5);

    for (let i = 0; i < 7; i++) {
      smallLogger.log(makeEntry({ id: `entry-${i}` }));
    }

    const all = smallLogger.getRecent(10);
    // Only 5 should remain (buffer size)
    expect(all).toHaveLength(5);
    // Oldest entries (0, 1) should be gone
    const ids = all.map((e) => e.id);
    expect(ids).not.toContain('entry-0');
    expect(ids).not.toContain('entry-1');
    // Newest should still be there
    expect(ids).toContain('entry-6');
    expect(ids).toContain('entry-5');
  });

  test('getStats returns correct total decisions', () => {
    logger.log(makeEntry());
    logger.log(makeEntry());
    logger.log(makeEntry());

    const stats = logger.getStats();
    expect(stats.totalDecisions).toBe(3);
  });

  test('getStats returns correct tier breakdown', () => {
    logger.log(makeEntry({
      decision: {
        eventTier: EventTier.ROUTINE,
        selectedProvider: ProviderType.OPENAI,
        selectedModel: 'gpt-4o-mini',
        failoverOccurred: false,
        latencyMs: 50,
        timestamp: createTimestamp(),
      },
    }));
    logger.log(makeEntry({
      decision: {
        eventTier: EventTier.OPERATIONAL,
        selectedProvider: ProviderType.ANTHROPIC,
        selectedModel: 'claude-haiku-4-5',
        failoverOccurred: false,
        latencyMs: 100,
        timestamp: createTimestamp(),
      },
    }));
    logger.log(makeEntry({
      decision: {
        eventTier: EventTier.STRATEGIC,
        selectedProvider: ProviderType.ANTHROPIC,
        selectedModel: 'claude-opus-4-6',
        failoverOccurred: false,
        latencyMs: 200,
        timestamp: createTimestamp(),
      },
    }));
    logger.log(makeEntry({
      decision: {
        eventTier: EventTier.ROUTINE,
        selectedProvider: ProviderType.OPENAI,
        selectedModel: 'gpt-4o-mini',
        failoverOccurred: false,
        latencyMs: 45,
        timestamp: createTimestamp(),
      },
    }));

    const stats = logger.getStats();
    expect(stats.tierBreakdown[EventTier.ROUTINE]).toBe(2);
    expect(stats.tierBreakdown[EventTier.OPERATIONAL]).toBe(1);
    expect(stats.tierBreakdown[EventTier.STRATEGIC]).toBe(1);
  });

  test('getStats returns failover count', () => {
    logger.log(makeEntry({
      decision: {
        eventTier: EventTier.ROUTINE,
        selectedProvider: ProviderType.ANTHROPIC,
        selectedModel: 'claude-haiku-4-5',
        failoverOccurred: true,
        failoverFrom: ProviderType.OPENAI,
        latencyMs: 80,
        timestamp: createTimestamp(),
      },
    }));
    logger.log(makeEntry());  // No failover

    const stats = logger.getStats();
    expect(stats.failoverCount).toBe(1);
  });

  test('getStats returns average latency', () => {
    logger.log(makeEntry({
      decision: {
        eventTier: EventTier.ROUTINE,
        selectedProvider: ProviderType.OPENAI,
        selectedModel: 'gpt-4o-mini',
        failoverOccurred: false,
        latencyMs: 100,
        timestamp: createTimestamp(),
      },
    }));
    logger.log(makeEntry({
      decision: {
        eventTier: EventTier.ROUTINE,
        selectedProvider: ProviderType.OPENAI,
        selectedModel: 'gpt-4o-mini',
        failoverOccurred: false,
        latencyMs: 200,
        timestamp: createTimestamp(),
      },
    }));

    const stats = logger.getStats();
    expect(stats.avgLatencyMs).toBe(150);
  });

  test('getStats returns zeros for empty logger', () => {
    const stats = logger.getStats();
    expect(stats.totalDecisions).toBe(0);
    expect(stats.failoverCount).toBe(0);
    expect(stats.avgLatencyMs).toBe(0);
    expect(stats.tierBreakdown[EventTier.ROUTINE]).toBe(0);
    expect(stats.tierBreakdown[EventTier.OPERATIONAL]).toBe(0);
    expect(stats.tierBreakdown[EventTier.STRATEGIC]).toBe(0);
  });

  test('size returns current entry count', () => {
    expect(logger.size()).toBe(0);
    logger.log(makeEntry());
    expect(logger.size()).toBe(1);
    logger.log(makeEntry());
    logger.log(makeEntry());
    expect(logger.size()).toBe(3);
  });

  test('clear removes all entries', () => {
    logger.log(makeEntry());
    logger.log(makeEntry());
    expect(logger.size()).toBe(2);

    logger.clear();
    expect(logger.size()).toBe(0);
    expect(logger.getRecent(10)).toHaveLength(0);
    expect(logger.getStats().totalDecisions).toBe(0);
  });
});
