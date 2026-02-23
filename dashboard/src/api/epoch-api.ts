// Epoch Engine API Client
// Communicates with orchestration service (port 12064) via Vite proxy

const API_BASE = '/api';

// --- Type Definitions ---

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  version?: string;
  error?: string;
}

export interface DeepHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    orchestration: ServiceHealth;
    logistics: ServiceHealth;
    websocket: ServiceHealth;
  };
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: string;
  eventTier: 'ROUTINE' | 'OPERATIONAL' | 'STRATEGIC';
  provider: string;
  model: string;
  latencyMs: number;
  cost: number;
  failover: boolean;
  result: string;
}

export interface AuditStats {
  totalDecisions: number;
  failoverCount: number;
  avgLatencyMs: number;
  tierBreakdown: {
    ROUTINE: number;
    OPERATIONAL: number;
    STRATEGIC: number;
  };
}

export interface SystemStatus {
  eventsProcessed: number;
  vetoes: number;
  avgLatencyMs: number;
}

export interface GameEvent {
  type: string;
  npcId?: string;
  data: Record<string, unknown>;
}

export interface MeshResponse {
  eventId: string;
  tier: string;
  provider: string;
  model: string;
  result: unknown;
  latencyMs: number;
  failover: boolean;
}

// --- Fetch with Retry ---

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 2
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok || response.status < 500) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}

// --- API Functions ---

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetchWithRetry('/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function fetchSystemHealth(): Promise<DeepHealthResponse> {
  const res = await fetchWithRetry('/health/deep');
  if (!res.ok) throw new Error(`Deep health check failed: ${res.status}`);
  return res.json();
}

export async function fetchAuditLog(count = 50): Promise<AuditLogEntry[]> {
  const res = await fetchWithRetry(`${API_BASE}/audit?count=${count}`);
  if (!res.ok) throw new Error(`Audit log fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchAuditStats(): Promise<AuditStats> {
  const res = await fetchWithRetry(`${API_BASE}/audit/stats`);
  if (!res.ok) throw new Error(`Audit stats fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await fetchWithRetry(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`System status fetch failed: ${res.status}`);
  return res.json();
}

export async function submitEvent(event: GameEvent): Promise<MeshResponse> {
  const res = await fetchWithRetry(`${API_BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`Event submission failed: ${res.status}`);
  return res.json();
}
