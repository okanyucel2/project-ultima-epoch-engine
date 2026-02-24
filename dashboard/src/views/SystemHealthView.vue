<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { fetchSystemHealth, type DeepHealthResponse, type ServiceHealth } from '../api/epoch-api';
import StatusBadge from '../components/StatusBadge.vue';
import { useWatchdogTelemetry, type WatchdogEvent } from '../composables/useWatchdogTelemetry';

const healthData = ref<DeepHealthResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

// Wave 25B: Watchdog telemetry — live restart/startup/shutdown events
const { events: watchdogEvents, lastRestart } = useWatchdogTelemetry();
const restartingServices = reactive(new Set<string>());

interface ServiceDisplay {
  name: string;
  key: string;
  health: ServiceHealth | null;
}

const services = computed<ServiceDisplay[]>(() => {
  if (!healthData.value) {
    return [
      { name: 'Orchestration', key: 'orchestration', health: null },
      { name: 'Logistics', key: 'logistics', health: null },
      { name: 'WebSocket', key: 'websocket', health: null },
    ];
  }

  const s = healthData.value.services;
  return [
    { name: 'Orchestration', key: 'orchestration', health: s.orchestration },
    { name: 'Logistics', key: 'logistics', health: s.logistics },
    { name: 'WebSocket', key: 'websocket', health: s.websocket },
  ];
});

const overallStatus = computed(() => {
  return healthData.value?.status ?? 'unknown';
});

const overallBadgeStatus = computed((): 'online' | 'degraded' | 'offline' => {
  switch (overallStatus.value) {
    case 'healthy': return 'online';
    case 'degraded': return 'degraded';
    case 'unhealthy': return 'offline';
    default: return 'offline';
  }
});

const overallBannerClass = computed(() => {
  switch (overallStatus.value) {
    case 'healthy': return 'banner--healthy';
    case 'degraded': return 'banner--degraded';
    case 'unhealthy': return 'banner--unhealthy';
    default: return 'banner--unknown';
  }
});

function serviceStatusToBadge(status?: string): 'online' | 'degraded' | 'offline' {
  switch (status) {
    case 'healthy': return 'online';
    case 'degraded': return 'degraded';
    case 'unhealthy': return 'offline';
    default: return 'offline';
  }
}

async function loadHealth(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    healthData.value = await fetchSystemHealth();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch health data';
  } finally {
    loading.value = false;
  }
}

// Wave 25B: Map service from watchdog event name to card key
function serviceKeyFromEvent(service: string): string | null {
  const lower = service.toLowerCase();
  if (lower.includes('orchestration') || lower.includes('backend')) return 'orchestration';
  if (lower.includes('logistics')) return 'logistics';
  if (lower.includes('websocket')) return 'websocket';
  if (lower.includes('frontend') || lower.includes('dashboard')) return 'frontend';
  return null;
}

// Last 10 events for the Recent Events card
const recentEvents = computed(() => watchdogEvents.value.slice(0, 10));

// Watch for restart events and trigger pulse-glow animation
watch(lastRestart, (event) => {
  if (!event) return;
  const key = serviceKeyFromEvent(event.service);
  if (!key) return;
  restartingServices.add(key);
  setTimeout(() => restartingServices.delete(key), 5000);
});

function formatEventTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

function eventTypeLabel(type: string): string {
  switch (type) {
    case 'watchdog_restart': return 'RESTART';
    case 'startup': return 'STARTUP';
    case 'shutdown': return 'SHUTDOWN';
    default: return type.toUpperCase();
  }
}

function eventTypeClass(type: string): string {
  switch (type) {
    case 'watchdog_restart': return 'event-tag--restart';
    case 'startup': return 'event-tag--startup';
    case 'shutdown': return 'event-tag--shutdown';
    default: return '';
  }
}

let refreshInterval: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  loadHealth();
  refreshInterval = setInterval(loadHealth, 10000);
});

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<template>
  <div class="system-health">
    <h1 class="view-title">System Health</h1>

    <!-- Overall Status Banner -->
    <div :class="['glass-card', 'banner', overallBannerClass]">
      <StatusBadge :status="overallBadgeStatus" />
      <span class="banner__text">
        System is <strong>{{ overallStatus }}</strong>
      </span>
      <span class="text-muted banner__refresh">Auto-refresh: 10s</span>
    </div>

    <!-- Loading -->
    <div v-if="loading && !healthData" class="state-message">
      <p class="pulse">Checking system health...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error && !healthData" class="state-message state-message--error">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="loadHealth">Retry</button>
    </div>

    <!-- Service Cards -->
    <div v-else class="services-grid">
      <div
        v-for="service in services"
        :key="service.key"
        :class="['glass-card', 'service-card', { 'service-card--restarting': restartingServices.has(service.key) }]"
      >
        <div class="service-card__header">
          <h3 class="service-card__name">{{ service.name }}</h3>
          <StatusBadge
            v-if="service.health"
            :status="serviceStatusToBadge(service.health.status)"
          />
          <StatusBadge v-else status="offline" label="Unknown" />
        </div>

        <div class="service-card__details">
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span :class="service.health ? `status-${service.health.status}` : 'text-muted'">
              {{ service.health?.status ?? 'unknown' }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Version</span>
            <span class="text-secondary">{{ service.health?.version ?? '--' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Response Time</span>
            <span class="text-secondary">
              {{ service.health?.responseTime != null ? `${service.health.responseTime}ms` : '--' }}
            </span>
          </div>
          <div v-if="service.health?.error" class="detail-row detail-row--error">
            <span class="detail-label">Error</span>
            <span class="text-danger">{{ service.health.error }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Wave 25B: Recent Watchdog Events -->
    <div v-if="recentEvents.length > 0" class="glass-card events-card">
      <h3 class="events-card__title">Recent Events</h3>
      <div class="events-list">
        <div
          v-for="(event, idx) in recentEvents"
          :key="idx"
          class="event-row"
        >
          <span :class="['event-tag', eventTypeClass(event.type)]">
            {{ eventTypeLabel(event.type) }}
          </span>
          <span class="event-service">{{ event.service }}</span>
          <span v-if="event.reason" class="text-muted event-reason">{{ event.reason }}</span>
          <span class="text-muted event-time">{{ formatEventTime(event.timestamp) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.system-health {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.view-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
}

.banner--healthy {
  border-color: rgba(34, 197, 94, 0.3);
}

.banner--degraded {
  border-color: rgba(245, 158, 11, 0.3);
}

.banner--unhealthy {
  border-color: rgba(239, 68, 68, 0.3);
}

.banner--unknown {
  border-color: var(--glass-border);
}

.banner__text {
  flex: 1;
  font-size: 1rem;
}

.banner__refresh {
  font-size: 0.75rem;
}

.services-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
}

.service-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.service-card__name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.service-card__details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-row--error {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(239, 68, 68, 0.2);
}

.detail-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.text-danger {
  color: var(--accent-danger);
  font-size: 0.85rem;
}

.state-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.state-message--error {
  color: var(--accent-danger);
}

.retry-btn {
  margin-top: 1rem;
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.85rem;
}

/* Wave 25B: Pulse-glow animation for restarting services */
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 rgba(245, 158, 11, 0); }
  50% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.4); }
}

.service-card--restarting {
  animation: pulse-glow 1.5s ease-in-out 3;
  border-color: rgba(245, 158, 11, 0.5);
}

/* Wave 25B: Recent Events card */
.events-card__title {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.event-tag {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
}

.event-tag--restart {
  background: rgba(245, 158, 11, 0.15);
  color: rgb(245, 158, 11);
}

.event-tag--startup {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(34, 197, 94);
}

.event-tag--shutdown {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(239, 68, 68);
}

.event-service {
  font-weight: 500;
  flex-shrink: 0;
}

.event-reason {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-time {
  flex-shrink: 0;
  font-size: 0.75rem;
}
</style>
