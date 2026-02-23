package npc

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRegisterNPC(t *testing.T) {
	engine := NewBehaviorEngine()
	npc := engine.RegisterNPC("npc-001")

	assert.Equal(t, "npc-001", npc.NPCID)
	assert.InDelta(t, 0.5, npc.WorkEfficiency, 0.001, "Default work efficiency should be 0.5")
	assert.InDelta(t, 0.5, npc.Morale, 0.001, "Default morale should be 0.5")
	assert.Equal(t, "", npc.AssignedTask, "Should have no assigned task initially")
}

func TestRegisterNPC_Duplicate(t *testing.T) {
	engine := NewBehaviorEngine()
	npc1 := engine.RegisterNPC("npc-001")
	npc1.Morale = 0.8

	// Registering same ID returns existing
	npc2 := engine.RegisterNPC("npc-001")
	assert.InDelta(t, 0.8, npc2.Morale, 0.001, "Should return existing NPC with modified morale")
}

func TestApplyWorkEfficiencyModifier(t *testing.T) {
	engine := NewBehaviorEngine()
	engine.RegisterNPC("npc-001")

	err := engine.ApplyWorkEfficiencyModifier("npc-001", -0.30)
	assert.NoError(t, err)

	npc, ok := engine.GetNPC("npc-001")
	assert.True(t, ok)
	assert.InDelta(t, 0.2, npc.WorkEfficiency, 0.001, "0.5 + (-0.3) = 0.2")
}

func TestApplyWorkEfficiencyModifier_Clamp(t *testing.T) {
	engine := NewBehaviorEngine()
	engine.RegisterNPC("npc-clamp")

	// Apply large negative modifier - should clamp to 0
	err := engine.ApplyWorkEfficiencyModifier("npc-clamp", -1.0)
	assert.NoError(t, err)

	npc, _ := engine.GetNPC("npc-clamp")
	assert.InDelta(t, 0.0, npc.WorkEfficiency, 0.001, "Should clamp to 0.0")

	// Apply large positive modifier - should clamp to 1
	err = engine.ApplyWorkEfficiencyModifier("npc-clamp", 5.0)
	assert.NoError(t, err)

	npc, _ = engine.GetNPC("npc-clamp")
	assert.InDelta(t, 1.0, npc.WorkEfficiency, 0.001, "Should clamp to 1.0")
}

func TestApplyWorkEfficiencyModifier_NotFound(t *testing.T) {
	engine := NewBehaviorEngine()

	err := engine.ApplyWorkEfficiencyModifier("npc-unknown", -0.30)
	assert.Error(t, err, "Should return error for unknown NPC")
}

func TestApplyMoraleModifier(t *testing.T) {
	engine := NewBehaviorEngine()
	engine.RegisterNPC("npc-morale")

	// Positive modifier
	err := engine.ApplyMoraleModifier("npc-morale", 0.20)
	assert.NoError(t, err)

	npc, _ := engine.GetNPC("npc-morale")
	assert.InDelta(t, 0.70, npc.Morale, 0.001, "0.5 + 0.20 = 0.70")

	// Negative modifier
	err = engine.ApplyMoraleModifier("npc-morale", -0.30)
	assert.NoError(t, err)

	npc, _ = engine.GetNPC("npc-morale")
	assert.InDelta(t, 0.40, npc.Morale, 0.001, "0.70 - 0.30 = 0.40")
}

func TestApplyMoraleModifier_Clamp(t *testing.T) {
	engine := NewBehaviorEngine()
	engine.RegisterNPC("npc-morale-clamp")

	// Clamp to 0
	err := engine.ApplyMoraleModifier("npc-morale-clamp", -2.0)
	assert.NoError(t, err)

	npc, _ := engine.GetNPC("npc-morale-clamp")
	assert.InDelta(t, 0.0, npc.Morale, 0.001, "Should clamp to 0.0")

	// Clamp to 1
	err = engine.ApplyMoraleModifier("npc-morale-clamp", 5.0)
	assert.NoError(t, err)

	npc, _ = engine.GetNPC("npc-morale-clamp")
	assert.InDelta(t, 1.0, npc.Morale, 0.001, "Should clamp to 1.0")
}

func TestApplyMoraleModifier_NotFound(t *testing.T) {
	engine := NewBehaviorEngine()

	err := engine.ApplyMoraleModifier("npc-ghost", 0.10)
	assert.Error(t, err, "Should return error for unknown NPC")
}

func TestGetNPC_NotFound(t *testing.T) {
	engine := NewBehaviorEngine()

	npc, ok := engine.GetNPC("npc-nonexistent")
	assert.False(t, ok, "Should return false for unknown NPC")
	assert.Nil(t, npc, "Should return nil for unknown NPC")
}

func TestGetAllNPCs(t *testing.T) {
	engine := NewBehaviorEngine()

	// Empty initially
	npcs := engine.GetAllNPCs()
	assert.Empty(t, npcs)

	// Register some
	engine.RegisterNPC("npc-a")
	engine.RegisterNPC("npc-b")
	engine.RegisterNPC("npc-c")

	npcs = engine.GetAllNPCs()
	assert.Len(t, npcs, 3, "Should return all 3 registered NPCs")

	// Verify all IDs exist
	ids := make(map[string]bool)
	for _, n := range npcs {
		ids[n.NPCID] = true
	}
	assert.True(t, ids["npc-a"])
	assert.True(t, ids["npc-b"])
	assert.True(t, ids["npc-c"])
}

func TestConcurrentAccess(t *testing.T) {
	engine := NewBehaviorEngine()
	engine.RegisterNPC("npc-concurrent")

	done := make(chan bool, 20)

	for i := 0; i < 10; i++ {
		go func() {
			_ = engine.ApplyMoraleModifier("npc-concurrent", 0.01)
			done <- true
		}()
		go func() {
			engine.GetAllNPCs()
			done <- true
		}()
	}

	for i := 0; i < 20; i++ {
		<-done
	}

	// If we get here without panics, concurrency is handled
	npc, ok := engine.GetNPC("npc-concurrent")
	assert.True(t, ok)
	assert.True(t, npc.Morale >= 0.0 && npc.Morale <= 1.0)
}
