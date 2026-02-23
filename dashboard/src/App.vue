<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useEpochWebSocket } from './composables/useEpochWebSocket';
import StatusBadge from './components/StatusBadge.vue';

const route = useRoute();
const { connected } = useEpochWebSocket(['npc-events', 'rebellion-alerts', 'system-status']);

const connectionStatus = computed((): 'online' | 'offline' => {
  return connected.value ? 'online' : 'offline';
});

const navItems = [
  { path: '/npcs', label: 'NPC Monitor', icon: 'B' },
  { path: '/rebellion', label: 'Rebellion', icon: 'F' },
  { path: '/audit', label: 'Audit Log', icon: 'S' },
  { path: '/system', label: 'System Health', icon: 'H' },
];

function isActive(path: string): boolean {
  return route.path === path;
}
</script>

<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__logo">EE</div>
        <div>
          <div class="sidebar__title">Epoch Engine</div>
          <div class="sidebar__subtitle">Admin Dashboard</div>
        </div>
      </div>

      <nav class="sidebar__nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="['nav-link', { 'nav-link--active': isActive(item.path) }]"
        >
          <span class="nav-link__icon">{{ item.icon }}</span>
          <span class="nav-link__label">{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar__footer">
        <StatusBadge :status="connectionStatus" label="WebSocket" />
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <header class="topbar">
        <h2 class="topbar__title">Epoch Engine</h2>
        <div class="topbar__status">
          <StatusBadge
            :status="connectionStatus"
            :label="connected ? 'Connected' : 'Disconnected'"
          />
        </div>
      </header>

      <div class="content-area">
        <router-view />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
}

/* Sidebar */
.sidebar {
  width: var(--sidebar-width);
  background: var(--glass-bg-solid);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.25rem;
  border-bottom: 1px solid var(--glass-border);
}

.sidebar__logo {
  width: 36px;
  height: 36px;
  background: var(--accent-primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.sidebar__title {
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1.2;
}

.sidebar__subtitle {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.sidebar__nav {
  flex: 1;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}

.nav-link--active {
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
}

.nav-link__icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.nav-link--active .nav-link__icon {
  background: rgba(99, 102, 241, 0.2);
}

.sidebar__footer {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--glass-border);
}

/* Main content */
.main-content {
  flex: 1;
  margin-left: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 1px solid var(--glass-border);
  background: var(--glass-bg-solid);
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.content-area {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}
</style>
