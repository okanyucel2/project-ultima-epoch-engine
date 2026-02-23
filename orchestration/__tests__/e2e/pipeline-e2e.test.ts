// =============================================================================
// E2E Pipeline Tests — Full Neural Mesh event pipeline
// =============================================================================
// Tests the complete flow: HTTP request → classify → route → LLM → rebellion
// check → cognitive rails → WebSocket broadcast → HTTP response
// =============================================================================

import request from 'supertest';
import { createTestApp, type TestAppInstance } from './test-app-factory';

let testApp: TestAppInstance;

beforeEach(() => {
  testApp = createTestApp();
});

// =============================================================================
// POST /api/events — Single event processing
// =============================================================================

describe('POST /api/events — Neural Mesh Pipeline', () => {
  it('should process a valid event through the full pipeline', async () => {
    const event = {
      eventId: 'e2e-test-001',
      npcId: 'npc-bones',
      eventType: 'resource_change',
      description: 'Captain Bones received additional mineral shipment',
    };

    const res = await request(testApp.app)
      .post('/api/events')
      .send(event)
      .expect(200);

    expect(res.body).toMatchObject({
      eventId: 'e2e-test-001',
      tier: expect.any(String),
      aiResponse: expect.any(String),
      rebellionCheck: {
        probability: 0.15,
        thresholdExceeded: false,
      },
      vetoApplied: false,
      processingTimeMs: expect.any(Number),
    });

    // Verify logistics was called
    const rebellionCalls = testApp.mockLogistics.calls.filter(c => c.method === 'getRebellionProbability');
    expect(rebellionCalls.length).toBe(1);
    expect(rebellionCalls[0].args[0]).toBe('npc-bones');

    // Verify WebSocket broadcast to npc-events (not vetoed)
    const npcBroadcasts = testApp.mockWs.broadcasts.filter(b => b.channel === 'npc-events');
    expect(npcBroadcasts.length).toBe(1);
  });

  it('should veto events when rebellion probability exceeds threshold', async () => {
    // Set high rebellion probability
    testApp.mockLogistics.rebellionProbability = 0.85;
    testApp.mockLogistics.thresholdExceeded = true;

    const event = {
      eventId: 'e2e-veto-001',
      npcId: 'npc-rebel',
      eventType: 'command',
      description: 'Direct order to increase mining output by 200%',
    };

    const res = await request(testApp.app)
      .post('/api/events')
      .send(event)
      .expect(200);

    expect(res.body.vetoApplied).toBe(true);
    expect(res.body.vetoReason).toBeDefined();
    expect(res.body.aiResponse).toContain('[VETOED]');

    // Verify broadcast went to cognitive-rails channel (not npc-events)
    const cogRailsBroadcasts = testApp.mockWs.broadcasts.filter(b => b.channel === 'cognitive-rails');
    expect(cogRailsBroadcasts.length).toBe(1);

    // Verify rebellion alert was also broadcast
    const rebellionAlerts = testApp.mockWs.broadcasts.filter(b => b.channel === 'rebellion-alerts');
    expect(rebellionAlerts.length).toBe(1);
  });

  it('should return 400 for events with missing required fields', async () => {
    const event = {
      eventId: 'incomplete-event',
      // missing: npcId, eventType, description
    };

    const res = await request(testApp.app)
      .post('/api/events')
      .send(event)
      .expect(400);

    expect(res.body.error).toContain('Missing required fields');
  });

  it('should handle logistics unavailability with safe fallback', async () => {
    testApp.mockLogistics.shouldFail = true;

    const event = {
      eventId: 'e2e-fallback-001',
      npcId: 'npc-unreachable',
      eventType: 'telemetry',
      description: 'System heartbeat when logistics is down',
    };

    const res = await request(testApp.app)
      .post('/api/events')
      .send(event)
      .expect(200);

    // Pipeline completes with fallback (probability=0, no veto)
    expect(res.body.rebellionCheck.probability).toBe(0);
    expect(res.body.vetoApplied).toBe(false);
  });
});

// =============================================================================
// POST /api/events/batch — Batch event processing
// =============================================================================

describe('POST /api/events/batch — Batch Processing', () => {
  it('should process multiple events concurrently', async () => {
    const events = [
      { eventId: 'batch-1', npcId: 'npc-a', eventType: 'telemetry', description: 'Heartbeat NPC A' },
      { eventId: 'batch-2', npcId: 'npc-b', eventType: 'resource_change', description: 'Resource shift NPC B' },
      { eventId: 'batch-3', npcId: 'npc-c', eventType: 'command', description: 'Order for NPC C' },
    ];

    const res = await request(testApp.app)
      .post('/api/events/batch')
      .send(events)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);

    // Each event processed independently
    res.body.forEach((response: Record<string, unknown>, i: number) => {
      expect(response.eventId).toBe(events[i].eventId);
    });
  });
});

// =============================================================================
// GET /health/deep — Deep health aggregation
// =============================================================================

describe('GET /health/deep — Deep Health Check', () => {
  it('should return aggregated health status', async () => {
    const res = await request(testApp.app)
      .get('/health/deep');

    // May return 200 (healthy/degraded) or 503 (unhealthy) depending on mocks
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// =============================================================================
// GET /api/audit — Audit trail
// =============================================================================

describe('GET /api/audit — Audit Trail', () => {
  it('should return audit stats after event processing', async () => {
    // Process an event first to generate audit data
    await request(testApp.app)
      .post('/api/events')
      .send({
        eventId: 'audit-test-001',
        npcId: 'npc-audit',
        eventType: 'telemetry',
        description: 'Event for audit trail test',
      })
      .expect(200);

    const res = await request(testApp.app)
      .get('/api/audit/stats')
      .expect(200);

    expect(res.body.totalDecisions).toBeGreaterThanOrEqual(1);
  });
});
