// =============================================================================
// EpochWebSocketServer Tests — Channel-based WebSocket broadcasting
// =============================================================================
// These tests use the ws library's client to connect to the real server
// on an ephemeral port (0 = OS-assigned) to avoid port conflicts.
// =============================================================================

import { EpochWebSocketServer } from '../src/services/websocket-server';
import WebSocket from 'ws';

/**
 * Helper: create a WS client connected to the server, wait for open.
 */
function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/**
 * Helper: wait for next message from a WS client.
 */
function waitForMessage(ws: WebSocket, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message timeout')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

describe('EpochWebSocketServer', () => {
  let server: EpochWebSocketServer;
  let clients: WebSocket[] = [];

  afterEach(async () => {
    // Close all clients
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    clients = [];

    // Close server
    if (server) {
      await server.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Test 1: Server starts on configured port
  // ---------------------------------------------------------------------------
  test('server starts and accepts connections on configured port', async () => {
    // Use port 0 for OS-assigned ephemeral port
    server = new EpochWebSocketServer(0);
    const port = server.getPort();
    expect(port).toBeGreaterThan(0);

    const client = await connectClient(port);
    clients.push(client);
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Client can subscribe to channels
  // ---------------------------------------------------------------------------
  test('client can subscribe to channels and receive confirmation', async () => {
    server = new EpochWebSocketServer(0);
    const port = server.getPort();

    const client = await connectClient(port);
    clients.push(client);

    const msgPromise = waitForMessage(client);
    client.send(JSON.stringify({
      type: 'subscribe',
      channels: ['npc-events', 'rebellion-alerts'],
    }));

    const response = await msgPromise as { type: string; channels: string[] };
    expect(response.type).toBe('subscribed');
    expect(response.channels).toEqual(expect.arrayContaining(['npc-events', 'rebellion-alerts']));
  });

  // ---------------------------------------------------------------------------
  // Test 3: Broadcast sends to subscribed clients only
  // ---------------------------------------------------------------------------
  test('broadcast sends messages only to subscribed clients', async () => {
    server = new EpochWebSocketServer(0);
    const port = server.getPort();

    // Client A subscribes to 'npc-events'
    const clientA = await connectClient(port);
    clients.push(clientA);
    const ackA = waitForMessage(clientA);
    clientA.send(JSON.stringify({ type: 'subscribe', channels: ['npc-events'] }));
    await ackA;

    // Client B subscribes to 'rebellion-alerts' (NOT 'npc-events')
    const clientB = await connectClient(port);
    clients.push(clientB);
    const ackB = waitForMessage(clientB);
    clientB.send(JSON.stringify({ type: 'subscribe', channels: ['rebellion-alerts'] }));
    await ackB;

    // Broadcast to 'npc-events'
    const msgPromise = waitForMessage(clientA);
    server.broadcast('npc-events', { action: 'move', npcId: 'npc-001' });

    const received = await msgPromise as { channel: string; data: unknown };
    expect(received.channel).toBe('npc-events');
    expect(received.data).toEqual({ action: 'move', npcId: 'npc-001' });

    // Client B should NOT receive the npc-events message
    // We verify by sending a rebellion-alerts message to B and ensuring it gets THAT
    const msgPromiseB = waitForMessage(clientB);
    server.broadcast('rebellion-alerts', { alert: 'high-rebellion' });
    const receivedB = await msgPromiseB as { channel: string; data: unknown };
    expect(receivedB.channel).toBe('rebellion-alerts');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Handles client disconnect gracefully
  // ---------------------------------------------------------------------------
  test('handles client disconnect without crashing', async () => {
    server = new EpochWebSocketServer(0);
    const port = server.getPort();

    const client = await connectClient(port);
    clients.push(client);

    expect(server.getConnectionCount()).toBe(1);

    // Disconnect the client
    client.close();

    // Wait for server to process disconnect
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(server.getConnectionCount()).toBe(0);

    // Broadcasting after disconnect should not throw
    expect(() => server.broadcast('npc-events', { test: true })).not.toThrow();
  });
});
