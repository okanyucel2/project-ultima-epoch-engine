<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { fetchSystemHealth, type DeepHealthResponse, type ServiceHealth } from '../api/epoch-api';
import StatusBadge from '../components/StatusBadge.vue';

const healthData = ref<DeepHealthResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

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
        class="glass-card service-card"
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
</style>
