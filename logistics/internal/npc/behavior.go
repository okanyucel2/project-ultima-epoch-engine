package npc

import (
	"fmt"
	"math"
	"sync"
)

// NPCBehavior represents the behavioral state of a single NPC in the simulation.
type NPCBehavior struct {
	NPCID          string
	Role           string  // NPC role: "worker", "warrior", "guard"
	WorkEfficiency float64 // 0.0-1.0: current work output efficiency
	Morale         float64 // 0.0-1.0: current morale level
	AssignedTask   string  // Current task assignment (empty if unassigned)
}

// BehaviorEngine manages NPC behavioral states. It is safe for concurrent use.
type BehaviorEngine struct {
	npcs map[string]*NPCBehavior
	mu   sync.RWMutex
}

// NewBehaviorEngine creates a new BehaviorEngine with an empty NPC registry.
func NewBehaviorEngine() *BehaviorEngine {
	return &BehaviorEngine{
		npcs: make(map[string]*NPCBehavior),
	}
}

// RegisterNPC adds an NPC to tracking with default values (0.5 efficiency, 0.5 morale).
// If the NPC is already registered, returns the existing entry without modification.
func (b *BehaviorEngine) RegisterNPC(npcID string) *NPCBehavior {
	b.mu.Lock()
	defer b.mu.Unlock()

	if existing, ok := b.npcs[npcID]; ok {
		return existing
	}

	npc := &NPCBehavior{
		NPCID:          npcID,
		Role:           "worker",
		WorkEfficiency: 0.5,
		Morale:         0.5,
		AssignedTask:   "",
	}
	b.npcs[npcID] = npc
	return npc
}

// RegisterNPCWithRole adds an NPC with a specific role (e.g. "warrior", "guard", "worker").
// If the NPC is already registered, updates the role and returns the existing entry.
func (b *BehaviorEngine) RegisterNPCWithRole(npcID, role string) *NPCBehavior {
	b.mu.Lock()
	defer b.mu.Unlock()

	if existing, ok := b.npcs[npcID]; ok {
		existing.Role = role
		return existing
	}

	npc := &NPCBehavior{
		NPCID:          npcID,
		Role:           role,
		WorkEfficiency: 0.5,
		Morale:         0.5,
		AssignedTask:   "",
	}
	b.npcs[npcID] = npc
	return npc
}

// GetNPCsByRole returns all NPCs with the specified role.
func (b *BehaviorEngine) GetNPCsByRole(role string) []*NPCBehavior {
	b.mu.RLock()
	defer b.mu.RUnlock()

	result := make([]*NPCBehavior, 0)
	for _, npc := range b.npcs {
		if npc.Role == role {
			result = append(result, npc)
		}
	}
	return result
}

// GetNPC returns the behavioral state of the specified NPC.
// Returns nil and false if the NPC is not registered.
func (b *BehaviorEngine) GetNPC(npcID string) (*NPCBehavior, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	npc, ok := b.npcs[npcID]
	if !ok {
		return nil, false
	}
	return npc, true
}

// ApplyWorkEfficiencyModifier modifies an NPC's work efficiency by the given modifier.
// The result is clamped to [0.0, 1.0].
// Returns an error if the NPC is not registered.
func (b *BehaviorEngine) ApplyWorkEfficiencyModifier(npcID string, modifier float64) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	npc, ok := b.npcs[npcID]
	if !ok {
		return fmt.Errorf("NPC %q not found", npcID)
	}

	npc.WorkEfficiency = clamp(npc.WorkEfficiency+modifier, 0.0, 1.0)
	return nil
}

// ApplyMoraleModifier modifies an NPC's morale by the given modifier.
// The result is clamped to [0.0, 1.0].
// Returns an error if the NPC is not registered.
func (b *BehaviorEngine) ApplyMoraleModifier(npcID string, modifier float64) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	npc, ok := b.npcs[npcID]
	if !ok {
		return fmt.Errorf("NPC %q not found", npcID)
	}

	npc.Morale = clamp(npc.Morale+modifier, 0.0, 1.0)
	return nil
}

// GetAllNPCs returns a slice of all registered NPC behaviors.
// The returned slice contains pointers to the actual NPC data.
func (b *BehaviorEngine) GetAllNPCs() []*NPCBehavior {
	b.mu.RLock()
	defer b.mu.RUnlock()

	result := make([]*NPCBehavior, 0, len(b.npcs))
	for _, npc := range b.npcs {
		result = append(result, npc)
	}
	return result
}

// clamp restricts a value to the range [min, max].
func clamp(value, min, max float64) float64 {
	return math.Max(min, math.Min(max, value))
}
