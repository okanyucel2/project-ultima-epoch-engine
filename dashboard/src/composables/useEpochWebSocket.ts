import { ref, onUnmounted, readonly } from 'vue';

export interface WebSocketMessage {
  channel: string;
  data: Record<string, unknown>;
  timestamp: string;
}

type MessageHandler = (msg: WebSocketMessage) => void;

const WS_URL = 'ws://localhost:32064';
const MAX_MESSAGES = 100;
const RECONNECT_DELAY_MS = 5000;

// Singleton state - shared across all consumers
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let subscribedChannels: string[] = [];
const handlers = new Map<string, Set<MessageHandler>>();

const connected = ref(false);
const lastMessage = ref<WebSocketMessage | null>(null);
const messages = ref<WebSocketMessage[]>([]);

function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected.value = true;

    if (subscribedChannels.length > 0) {
      ws?.send(JSON.stringify({ subscribe: subscribedChannels }));
    }
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg: WebSocketMessage = JSON.parse(event.data);
      lastMessage.value = msg;

      messages.value = [msg, ...messages.value].slice(0, MAX_MESSAGES);

      const channelHandlers = handlers.get(msg.channel);
      if (channelHandlers) {
        channelHandlers.forEach((handler) => handler(msg));
      }

      const wildcardHandlers = handlers.get('*');
      if (wildcardHandlers) {
        wildcardHandlers.forEach((handler) => handler(msg));
      }
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    connected.value = false;
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    connected.value = false;
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (subscribedChannels.length > 0) {
      connect();
    }
  }, RECONNECT_DELAY_MS);
}

function subscribe(channels: string[]): void {
  const newChannels = channels.filter((c) => !subscribedChannels.includes(c));
  if (newChannels.length === 0) return;

  subscribedChannels = [...new Set([...subscribedChannels, ...channels])];

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ subscribe: newChannels }));
  } else {
    connect();
  }
}

function unsubscribe(channels: string[]): void {
  subscribedChannels = subscribedChannels.filter((c) => !channels.includes(c));
  channels.forEach((c) => handlers.delete(c));
}

function send(data: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  connected.value = false;
  subscribedChannels = [];
  handlers.clear();
}

/**
 * Composable for Epoch Engine WebSocket.
 * Uses singleton pattern - one connection shared across all components.
 *
 * @param channels - Channels to subscribe to on mount
 */
export function useEpochWebSocket(channels: string[] = []) {
  if (channels.length > 0) {
    subscribe(channels);
  }

  function onMessage(channel: string, handler: MessageHandler): void {
    if (!handlers.has(channel)) {
      handlers.set(channel, new Set());
    }
    handlers.get(channel)!.add(handler);
  }

  function offMessage(channel: string, handler: MessageHandler): void {
    handlers.get(channel)?.delete(handler);
  }

  onUnmounted(() => {
    // Clean up handlers registered by this component instance
    // Note: We do NOT disconnect or unsubscribe here to maintain singleton
  });

  return {
    connected: readonly(connected),
    lastMessage: readonly(lastMessage),
    messages: readonly(messages),
    send,
    disconnect,
    subscribe,
    unsubscribe,
    onMessage,
    offMessage,
  };
}
