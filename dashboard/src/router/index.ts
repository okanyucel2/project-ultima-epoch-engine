import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/npcs',
  },
  {
    path: '/npcs',
    name: 'npcs',
    component: () => import('../views/NPCMonitorView.vue'),
    meta: { title: 'NPC Monitor', icon: 'brain' },
  },
  {
    path: '/rebellion',
    name: 'rebellion',
    component: () => import('../views/RebellionDashboardView.vue'),
    meta: { title: 'Rebellion', icon: 'flame' },
  },
  {
    path: '/audit',
    name: 'audit',
    component: () => import('../views/AuditLogView.vue'),
    meta: { title: 'Audit Log', icon: 'scroll' },
  },
  {
    path: '/system',
    name: 'system',
    component: () => import('../views/SystemHealthView.vue'),
    meta: { title: 'System Health', icon: 'heartbeat' },
  },
];
