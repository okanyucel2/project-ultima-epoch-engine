<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { fetchAuditLog, fetchAuditStats, type AuditLogEntry, type AuditStats } from '../api/epoch-api';
import MetricCard from '../components/MetricCard.vue';

const entries = ref<AuditLogEntry[]>([]);
const stats = ref<AuditStats | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const page = ref(1);
const perPage = 20;

const totalPages = computed(() => Math.max(1, Math.ceil(entries.value.length / perPage)));

const paginatedEntries = computed(() => {
  const start = (page.value - 1) * perPage;
  return entries.value.slice(start, start + perPage);
});

const tierTotal = computed(() => {
  if (!stats.value) return 0;
  const tb = stats.value.tierBreakdown;
  return (tb.ROUTINE || 0) + (tb.OPERATIONAL || 0) + (tb.STRATEGIC || 0);
});

function tierPercent(tier: number): string {
  if (tierTotal.value === 0) return '0';
  return ((tier / tierTotal.value) * 100).toFixed(0);
}

function tierBadgeClass(tier: string): string {
  switch (tier) {
    case 'ROUTINE': return 'badge--info';
    case 'OPERATIONAL': return 'badge--warning';
    case 'STRATEGIC': return 'badge--primary';
    default: return 'badge--info';
  }
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString();
  } catch {
    return ts;
  }
}

function formatCost(cost: number): string {
  if (cost === 0) return '--';
  return `$${cost.toFixed(4)}`;
}

async function loadData(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [logData, statsData] = await Promise.all([
      fetchAuditLog(200),
      fetchAuditStats(),
    ]);
    entries.value = logData;
    stats.value = statsData;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load audit data';
  } finally {
    loading.value = false;
  }
}

function prevPage(): void {
  if (page.value > 1) page.value--;
}

function nextPage(): void {
  if (page.value < totalPages.value) page.value++;
}

let refreshInterval: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  loadData();
  refreshInterval = setInterval(loadData, 5000);
});

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<template>
  <div class="audit-log">
    <h1 class="view-title">Audit Log</h1>

    <!-- Stats Row -->
    <div class="metrics-row">
      <MetricCard
        label="Total Decisions"
        :value="stats?.totalDecisions ?? '--'"
        color="var(--accent-primary)"
      />
      <MetricCard
        label="Failover Count"
        :value="stats?.failoverCount ?? '--'"
        color="var(--accent-warning)"
      />
      <MetricCard
        label="Avg Latency"
        :value="stats ? `${stats.avgLatencyMs.toFixed(0)}ms` : '--'"
        color="var(--accent-info)"
      />
    </div>

    <!-- Tier Breakdown -->
    <div v-if="stats" class="glass-card tier-breakdown">
      <h3 class="section-title">Tier Distribution</h3>
      <div class="tier-bar">
        <div
          v-if="stats.tierBreakdown.ROUTINE"
          class="tier-segment tier-segment--routine"
          :style="{ width: `${tierPercent(stats.tierBreakdown.ROUTINE)}%` }"
          :title="`ROUTINE: ${stats.tierBreakdown.ROUTINE}`"
        ></div>
        <div
          v-if="stats.tierBreakdown.OPERATIONAL"
          class="tier-segment tier-segment--operational"
          :style="{ width: `${tierPercent(stats.tierBreakdown.OPERATIONAL)}%` }"
          :title="`OPERATIONAL: ${stats.tierBreakdown.OPERATIONAL}`"
        ></div>
        <div
          v-if="stats.tierBreakdown.STRATEGIC"
          class="tier-segment tier-segment--strategic"
          :style="{ width: `${tierPercent(stats.tierBreakdown.STRATEGIC)}%` }"
          :title="`STRATEGIC: ${stats.tierBreakdown.STRATEGIC}`"
        ></div>
      </div>
      <div class="tier-legend">
        <span class="tier-legend__item">
          <span class="tier-dot tier-dot--routine"></span>
          Routine ({{ stats.tierBreakdown.ROUTINE || 0 }})
        </span>
        <span class="tier-legend__item">
          <span class="tier-dot tier-dot--operational"></span>
          Operational ({{ stats.tierBreakdown.OPERATIONAL || 0 }})
        </span>
        <span class="tier-legend__item">
          <span class="tier-dot tier-dot--strategic"></span>
          Strategic ({{ stats.tierBreakdown.STRATEGIC || 0 }})
        </span>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && entries.length === 0" class="state-message">
      <p class="pulse">Loading audit log...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="state-message state-message--error">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="loadData">Retry</button>
    </div>

    <!-- Empty -->
    <div v-else-if="entries.length === 0" class="state-message">
      <p>No audit entries yet.</p>
      <p class="text-muted">Entries will appear as the AI Router processes events.</p>
    </div>

    <!-- Table -->
    <div v-else class="glass-card table-container">
      <table class="glass-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Tier</th>
            <th>Provider</th>
            <th>Model</th>
            <th>Latency</th>
            <th>Cost</th>
            <th>Failover</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in paginatedEntries" :key="entry.id" class="fade-in">
            <td class="text-muted monospace">{{ formatTimestamp(entry.timestamp) }}</td>
            <td><span :class="['badge', tierBadgeClass(entry.eventTier)]">{{ entry.eventTier }}</span></td>
            <td>{{ entry.provider }}</td>
            <td class="text-secondary">{{ entry.model }}</td>
            <td>{{ entry.latencyMs }}ms</td>
            <td class="text-muted">{{ formatCost(entry.cost) }}</td>
            <td>
              <span v-if="entry.failover" class="badge badge--danger">Yes</span>
              <span v-else class="text-muted">--</span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div class="pagination">
        <button class="page-btn" :disabled="page <= 1" @click="prevPage">Prev</button>
        <span class="page-info text-secondary">
          Page {{ page }} of {{ totalPages }}
        </span>
        <button class="page-btn" :disabled="page >= totalPages" @click="nextPage">Next</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audit-log {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.view-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.section-title {
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.tier-breakdown {
  padding: 1.25rem 1.5rem;
}

.tier-bar {
  display: flex;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 0.75rem;
}

.tier-segment {
  height: 100%;
  transition: width 0.5s ease;
}

.tier-segment--routine { background: var(--accent-info); }
.tier-segment--operational { background: var(--accent-warning); }
.tier-segment--strategic { background: var(--accent-primary); }

.tier-legend {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.tier-legend__item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.tier-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.tier-dot--routine { background: var(--accent-info); }
.tier-dot--operational { background: var(--accent-warning); }
.tier-dot--strategic { background: var(--accent-primary); }

.table-container {
  overflow-x: auto;
}

.monospace {
  font-family: monospace;
  font-size: 0.8rem;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--glass-border);
  margin-top: 1rem;
}

.page-btn {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  padding: 0.4rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: border-color 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--accent-primary);
}

.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-info {
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
