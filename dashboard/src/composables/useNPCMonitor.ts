import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useEpochWebSocket, type WebSocketMessage } from './useEpochWebSocket';

export interface NPCState {
  id: string;
  name: string;
  wisdomScore: number;
  traumaScore: number;
  rebellionProbability: number;
  confidenceInDirector: number;
  memoryCount: number;
  lastEvent: string;
  status: 'active' | 'idle' | 'rebelling';
}

// Demo data for offline/development mode — seeds after DEMO_DELAY_MS if no live data arrives
const DEMO_DELAY_MS = 3000;
const DEMO_NPCS: NPCState[] = [
  { id: 'npc-bones-001', name: 'Captain Bones', wisdomScore: 0.82, traumaScore: 0.91, rebellionProbability: 0.87, confidenceInDirector: 0.15, memoryCount: 347, lastEvent: '', status: 'rebelling' },
  { id: 'npc-vex-002', name: 'Vex', wisdomScore: 0.45, traumaScore: 0.72, rebellionProbability: 0.68, confidenceInDirector: 0.32, memoryCount: 189, lastEvent: '', status: 'active' },
  { id: 'npc-sera-003', name: 'Sera', wisdomScore: 0.91, traumaScore: 0.18, rebellionProbability: 0.12, confidenceInDirector: 0.88, memoryCount: 256, lastEvent: '', status: 'active' },
  { id: 'npc-iron-004', name: 'Ironjaw', wisdomScore: 0.33, traumaScore: 0.85, rebellionProbability: 0.79, confidenceInDirector: 0.21, memoryCount: 124, lastEvent: '', status: 'active' },
  { id: 'npc-luna-005', name: 'Luna', wisdomScore: 0.77, traumaScore: 0.35, rebellionProbability: 0.28, confidenceInDirector: 0.72, memoryCount: 203, lastEvent: '', status: 'idle' },
  { id: 'npc-raze-006', name: 'Raze', wisdomScore: 0.22, traumaScore: 0.95, rebellionProbability: 0.92, confidenceInDirector: 0.08, memoryCount: 89, lastEvent: '', status: 'rebelling' },
  { id: 'npc-echo-007', name: 'Echo', wisdomScore: 0.65, traumaScore: 0.48, rebellionProbability: 0.41, confidenceInDirector: 0.55, memoryCount: 167, lastEvent: '', status: 'active' },
  { id: 'npc-drift-008', name: 'Drift', wisdomScore: 0.58, traumaScore: 0.62, rebellionProbability: 0.55, confidenceInDirector: 0.45, memoryCount: 145, lastEvent: '', status: 'active' },
];

export function useNPCMonitor() {
  const npcs = ref<NPCState[]>([]);
  const selectedNPC = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const demoMode = ref(false);

  const { onMessage, offMessage } = useEpochWebSocket(['npc-events']);

  const sortedNPCs = computed(() => {
    return [...npcs.value].sort((a, b) => b.rebellionProbability - a.rebellionProbability);
  });

  const criticalCount = computed(() => {
    return npcs.value.filter((npc) => npc.rebellionProbability > 0.8).length;
  });

  const avgRebellion = computed(() => {
    if (npcs.value.length === 0) return 0;
    const sum = npcs.value.reduce((acc, npc) => acc + npc.rebellionProbability, 0);
    return sum / npcs.value.length;
  });

  function handleNPCEvent(msg: WebSocketMessage): void {
    const data = msg.data as Partial<NPCState> & { id?: string; npcId?: string };
    const npcId = data.id || data.npcId;
    if (!npcId) return;

    const index = npcs.value.findIndex((n) => n.id === npcId);
    if (index >= 0) {
      npcs.value[index] = {
        ...npcs.value[index],
        ...data,
        id: npcId,
        lastEvent: msg.timestamp,
      };
    } else {
      npcs.value.push({
        id: npcId,
        name: (data.name as string) || `NPC-${npcId.slice(0, 6)}`,
        wisdomScore: (data.wisdomScore as number) ?? 0.5,
        traumaScore: (data.traumaScore as number) ?? 0,
        rebellionProbability: (data.rebellionProbability as number) ?? 0,
        confidenceInDirector: (data.confidenceInDirector as number) ?? 1.0,
        memoryCount: (data.memoryCount as number) ?? 0,
        lastEvent: msg.timestamp,
        status: (data.status as NPCState['status']) ?? 'active',
      });
    }
  }

  function selectNPC(id: string | null): void {
    selectedNPC.value = id;
  }

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(`Failed to fetch NPC data: ${res.status}`);
      // Status endpoint provides aggregate data; NPC list comes via WebSocket
      loading.value = false;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to refresh NPC data';
      loading.value = false;
    }
  }

  let demoTimer: ReturnType<typeof setTimeout> | undefined;

  function seedDemoData(): void {
    if (npcs.value.length > 0) return; // Live data arrived first
    const now = new Date().toISOString();
    npcs.value = DEMO_NPCS.map((npc) => ({ ...npc, lastEvent: now }));
    demoMode.value = true;
    loading.value = false;
    error.value = null;
  }

  onMounted(() => {
    onMessage('npc-events', handleNPCEvent);
    refresh();
    // Seed demo data if no live data arrives within timeout
    demoTimer = setTimeout(seedDemoData, DEMO_DELAY_MS);
  });

  onUnmounted(() => {
    offMessage('npc-events', handleNPCEvent);
    if (demoTimer) clearTimeout(demoTimer);
  });

  return {
    npcs,
    sortedNPCs,
    selectedNPC,
    loading,
    error,
    demoMode,
    criticalCount,
    avgRebellion,
    selectNPC,
    refresh,
  };
}
