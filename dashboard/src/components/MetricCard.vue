<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'stable';
  color?: string;
}>();

function getTrendArrow(trend?: string): string {
  if (trend === 'up') return '\u2191';
  if (trend === 'down') return '\u2193';
  if (trend === 'stable') return '\u2192';
  return '';
}

function getTrendClass(trend?: string): string {
  if (trend === 'up') return 'trend--up';
  if (trend === 'down') return 'trend--down';
  return 'trend--stable';
}
</script>

<template>
  <div class="glass-card metric-card">
    <div class="metric-card__value" :style="color ? { color } : {}">
      {{ value }}
      <span v-if="trend" :class="['metric-card__trend', getTrendClass(trend)]">
        {{ getTrendArrow(trend) }}
      </span>
    </div>
    <div class="metric-card__label">{{ label }}</div>
  </div>
</template>

<style scoped>
.metric-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 160px;
}

.metric-card__value {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.metric-card__label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
}

.metric-card__trend {
  font-size: 1rem;
  font-weight: 600;
}

.trend--up { color: var(--accent-success); }
.trend--down { color: var(--accent-danger); }
.trend--stable { color: var(--text-muted); }
</style>
