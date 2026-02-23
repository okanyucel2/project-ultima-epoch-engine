<script setup lang="ts">
defineProps<{
  status: 'online' | 'degraded' | 'offline';
  label?: string;
}>();

function getStatusColor(status: string): string {
  switch (status) {
    case 'online': return 'var(--accent-success)';
    case 'degraded': return 'var(--accent-warning)';
    case 'offline': return 'var(--accent-danger)';
    default: return 'var(--text-muted)';
  }
}

function getStatusLabel(status: string, label?: string): string {
  if (label) return label;
  return status.charAt(0).toUpperCase() + status.slice(1);
}
</script>

<template>
  <span class="status-badge">
    <span
      class="status-badge__dot"
      :class="{ 'pulse': status === 'online' }"
      :style="{ backgroundColor: getStatusColor(status) }"
    ></span>
    <span class="status-badge__label">{{ getStatusLabel(status, label) }}</span>
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 500;
}

.status-badge__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-badge__label {
  color: var(--text-secondary);
}
</style>
