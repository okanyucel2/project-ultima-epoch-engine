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
  // /health/deep returns 503 with valid JSON when system is degraded — don't retry
  const res = await fetchWithRetry('/health/deep', undefined, 0);
  // Accept both 200 and 503 (degraded state returns valid JSON body)
  if (!res.ok && res.status !== 503) {
    throw new Error(`Deep health check failed: ${res.status}`);
  }
  const data = await res.json();
  // Map backend fields (latencyMs, details) to frontend types (responseTime, version)
  if (data.services) {
    for (const key of Object.keys(data.services)) {
      const svc = data.services[key];
      if (svc.latencyMs != null && svc.responseTime == null) {
        svc.responseTime = svc.latencyMs;
      }
      if (svc.status === 'down') {
        svc.status = 'unhealthy';
      }
    }
  }
  return data;
}

export async function fetchAuditLog(count = 50): Promise<AuditLogEntry[]> {
  const res = await fetchWithRetry(`${API_BASE}/audit?count=${count}`);
  if (!res.ok) throw new Error(`Audit log fetch failed: ${res.status}`);
  const data = await res.json();
  // Backend returns { entries: [...], count: N } — unwrap to array
  const raw: unknown[] = Array.isArray(data) ? data : (data?.entries ?? []);
  if (!Array.isArray(raw)) return [];
  // Map backend nested structure to flat frontend type
  return raw.map((entry: Record<string, unknown>) => {
    const decision = (entry.decision ?? {}) as Record<string, unknown>;
    const ts = entry.timestamp as Record<string, unknown> | string | undefined;
    const tierStr = ((decision.eventTier ?? '') as string).toUpperCase();
    return {
      id: (entry.id as string) ?? '',
      timestamp: typeof ts === 'string' ? ts : (ts?.iso8601 as string) ?? new Date().toISOString(),
      eventType: (entry.eventDescription as string) ?? '',
      eventTier: (tierStr === 'ROUTINE' || tierStr === 'OPERATIONAL' || tierStr === 'STRATEGIC' ? tierStr : 'ROUTINE') as AuditLogEntry['eventTier'],
      provider: (decision.selectedProvider as string) ?? '',
      model: (decision.selectedModel as string) ?? '',
      latencyMs: (decision.latencyMs as number) ?? 0,
      cost: (entry.estimatedCost as number) ?? 0,
      failover: (decision.failoverOccurred as boolean) ?? false,
      result: (entry.circuitState as string) ?? 'closed',
    };
  });
}

export async function fetchAuditStats(): Promise<AuditStats> {
  const res = await fetchWithRetry(`${API_BASE}/audit/stats`);
  if (!res.ok) throw new Error(`Audit stats fetch failed: ${res.status}`);
  const data = await res.json();
  // Normalize tier keys — backend uses lowercase, frontend expects uppercase
  if (data.tierBreakdown) {
    const tb = data.tierBreakdown;
    data.tierBreakdown = {
      ROUTINE: tb.ROUTINE ?? tb.routine ?? 0,
      OPERATIONAL: tb.OPERATIONAL ?? tb.operational ?? 0,
      STRATEGIC: tb.STRATEGIC ?? tb.strategic ?? 0,
    };
  }
  return data;
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
