// =============================================================================
// EpochWebSocketServer — Channel-based WebSocket broadcasting
// =============================================================================
// Provides real-time event broadcasting for Epoch Engine:
//   - Clients subscribe to channels via: { type: 'subscribe', channels: [...] }
//   - Server broadcasts to channel subscribers only
//   - Channels: npc-events, rebellion-alerts, simulation-ticks, system-status,
//               cognitive-rails
//   - Ping/pong heartbeat every 30s for connection health
// =============================================================================

import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { IncomingMessage } from 'http';

// =============================================================================
// Types
// =============================================================================

interface ClientState {
  ws: WsWebSocket;
  channels: Set<string>;
  isAlive: boolean;
}

interface SubscribeMessage {
  type: 'subscribe';
  channels: string[];
}

interface BroadcastEnvelope {
  channel: string;
  data: unknown;
  timestamp: string;
}

// =============================================================================
// Valid channels
// =============================================================================

const VALID_CHANNELS = new Set<string>([
  'npc-events',
  'npc-commands',
  'rebellion-alerts',
  'simulation-ticks',
  'system-status',
  'cognitive-rails',
]);

// =============================================================================
// EpochWebSocketServer Class
// =============================================================================

export class EpochWebSocketServer {
  private readonly wss: WebSocketServer;
  private readonly clients: Map<WsWebSocket, ClientState> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly port: number;

  constructor(port: number = 32064) {
    this.wss = new WebSocketServer({ port });
    this.port = port;

    // Resolve the actual listening port (important when port=0)
    const address = this.wss.address();
    if (address && typeof address === 'object') {
      this.port = address.port;
    }

    this.setupConnectionHandler();
    this.startHeartbeat();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Broadcast data to all clients subscribed to the given channel.
   */
  broadcast(channel: string, data: unknown): void {
    const envelope: BroadcastEnvelope = {
      channel,
      data,
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(envelope);

    for (const [ws, state] of this.clients) {
      if (state.channels.has(channel) && ws.readyState === WsWebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * Get the number of currently connected clients.
   */
  getConnectionCount(): number {
    return this.clients.size;
  }

  /**
   * Get the actual port the server is listening on.
   * Useful when constructed with port=0 (ephemeral).
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Gracefully shut down the WebSocket server.
   */
  async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    for (const [ws] of this.clients) {
      ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: Connection handling
  // ---------------------------------------------------------------------------

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: WsWebSocket, _req: IncomingMessage) => {
      const state: ClientState = {
        ws,
        channels: new Set(),
        isAlive: true,
      };

      this.clients.set(ws, state);

      // Handle incoming messages (subscribe requests)
      ws.on('message', (rawData) => {
        this.handleClientMessage(ws, state, rawData.toString());
      });

      // Handle pong responses (heartbeat)
      ws.on('pong', () => {
        state.isAlive = true;
      });

      // Handle disconnect
      ws.on('close', () => {
        this.clients.delete(ws);
      });

      // Handle errors (prevent crash)
      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Process a message from a connected client.
   * Currently supports: subscribe
   */
  private handleClientMessage(ws: WsWebSocket, state: ClientState, raw: string): void {
    try {
      const message = JSON.parse(raw);

      if (message.type === 'subscribe' && Array.isArray(message.channels)) {
        const subscribeMsg = message as SubscribeMessage;
        const subscribedChannels: string[] = [];

        for (const channel of subscribeMsg.channels) {
          if (typeof channel === 'string') {
            // Accept any channel name (VALID_CHANNELS is for documentation,
            // not enforcement — allows future extensibility)
            state.channels.add(channel);
            subscribedChannels.push(channel);
          }
        }

        // Send confirmation
        ws.send(JSON.stringify({
          type: 'subscribed',
          channels: subscribedChannels,
          timestamp: new Date().toISOString(),
        }));
      }
    } catch {
      // Ignore malformed JSON — don't crash the server
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON message',
        timestamp: new Date().toISOString(),
      }));
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Heartbeat (ping/pong)
  // ---------------------------------------------------------------------------

  /**
   * Start ping/pong heartbeat every 30 seconds.
   * Terminates clients that don't respond to ping.
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [ws, state] of this.clients) {
        if (!state.isAlive) {
          // Client didn't respond to last ping — terminate
          ws.terminate();
          this.clients.delete(ws);
          continue;
        }

        state.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }
}
