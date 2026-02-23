<script setup lang="ts">
import { ref, computed } from 'vue';
import { useNPCMonitor } from '../composables/useNPCMonitor';
import NPCDetailCard from '../components/NPCDetailCard.vue';

const { sortedNPCs, selectedNPC, loading, error, criticalCount, avgRebellion, selectNPC, refresh } = useNPCMonitor();

const searchQuery = ref('');
const sortBy = ref<'rebellion' | 'name' | 'wisdom'>('rebellion');

const filteredNPCs = computed(() => {
  let result = [...sortedNPCs.value];

  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (npc) =>
        npc.name.toLowerCase().includes(query) ||
        npc.id.toLowerCase().includes(query)
    );
  }

  // Sort
  switch (sortBy.value) {
    case 'rebellion':
      result.sort((a, b) => b.rebellionProbability - a.rebellionProbability);
      break;
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'wisdom':
      result.sort((a, b) => b.wisdomScore - a.wisdomScore);
      break;
  }

  return result;
});

const isEmpty = computed(() => !loading.value && !error.value && sortedNPCs.value.length === 0);
const hasResults = computed(() => filteredNPCs.value.length > 0);
</script>

<template>
  <div class="npc-monitor">
    <header class="npc-monitor__header">
      <div>
        <h1 class="view-title">NPC Monitor</h1>
        <p class="text-secondary">
          {{ sortedNPCs.length }} NPCs tracked
          <span v-if="criticalCount > 0" class="rebellion-critical">
            &mdash; {{ criticalCount }} critical
          </span>
        </p>
      </div>
      <div class="npc-monitor__controls">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search NPCs..."
          class="search-input"
        />
        <select v-model="sortBy" class="sort-select">
          <option value="rebellion">Sort: Rebellion</option>
          <option value="name">Sort: Name</option>
          <option value="wisdom">Sort: Wisdom</option>
        </select>
        <button class="refresh-btn" @click="refresh" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading && sortedNPCs.length === 0" class="state-message">
      <div class="state-message__icon pulse">...</div>
      <p>Loading NPC data...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="state-message state-message--error">
      <div class="state-message__icon">!</div>
      <p>{{ error }}</p>
      <button class="refresh-btn" @click="refresh">Retry</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="isEmpty" class="state-message">
      <div class="state-message__icon">~</div>
      <p>No NPCs detected yet.</p>
      <p class="text-muted">NPCs will appear as WebSocket events arrive.</p>
    </div>

    <!-- No Search Results -->
    <div v-else-if="!hasResults" class="state-message">
      <div class="state-message__icon">?</div>
      <p>No NPCs match "{{ searchQuery }}"</p>
    </div>

    <!-- NPC Grid -->
    <div v-else class="npc-grid">
      <NPCDetailCard
        v-for="npc in filteredNPCs"
        :key="npc.id"
        :npc="npc"
        :selected="selectedNPC === npc.id"
        @select="selectNPC"
      />
    </div>

    <!-- Stats Footer -->
    <footer v-if="sortedNPCs.length > 0" class="npc-monitor__footer glass-card">
      <span>Avg Rebellion: <strong :class="avgRebellion > 0.5 ? 'rebellion-high' : 'rebellion-low'">{{ (avgRebellion * 100).toFixed(1) }}%</strong></span>
      <span>Total NPCs: <strong>{{ sortedNPCs.length }}</strong></span>
      <span>Critical: <strong class="rebellion-critical">{{ criticalCount }}</strong></span>
    </footer>
  </div>
</template>

<style scoped>
.npc-monitor {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.npc-monitor__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
}

.view-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.npc-monitor__controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.search-input,
.sort-select {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  color: var(--text-primary);
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus,
.sort-select:focus {
  border-color: var(--accent-primary);
}

.search-input {
  width: 200px;
}

.sort-select {
  cursor: pointer;
}

.sort-select option {
  background: #1a1a2e;
}

.refresh-btn {
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.25);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.npc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
}

.state-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.state-message--error {
  color: var(--accent-danger);
}

.state-message__icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.npc-monitor__footer {
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 1rem 1.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}
</style>
