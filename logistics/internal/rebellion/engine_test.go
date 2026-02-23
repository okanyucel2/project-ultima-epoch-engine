package rebellion

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	assert.Equal(t, 0.05, cfg.BaseProbability, "BaseProbability should default to 0.05")
	assert.Equal(t, 0.30, cfg.TraumaWeight, "TraumaWeight should default to 0.30")
	assert.Equal(t, 0.30, cfg.EfficiencyWeight, "EfficiencyWeight should default to 0.30")
	assert.Equal(t, 0.20, cfg.MoraleWeight, "MoraleWeight should default to 0.20")
	assert.Equal(t, 0.35, cfg.HaltThreshold, "HaltThreshold should default to 0.35")
	assert.Equal(t, 0.80, cfg.VetoThreshold, "VetoThreshold should default to 0.80")
}

func TestCalculateProbability_AllZeros(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-001",
		AvgTrauma:      0.0,
		WorkEfficiency: 1.0, // Perfect efficiency means 0 rebellion contribution
		Morale:         1.0, // Perfect morale means 0 rebellion contribution
		MemoryCount:    0,
	}

	result := engine.CalculateProbability(profile)

	assert.Equal(t, "npc-001", result.NPCID)
	assert.InDelta(t, 0.05, result.Probability, 0.001, "With perfect stats, probability should be base only (0.05)")
	assert.InDelta(t, 0.05, result.Factors.Base, 0.001)
	assert.InDelta(t, 0.0, result.Factors.TraumaModifier, 0.001)
	assert.InDelta(t, 0.0, result.Factors.EfficiencyModifier, 0.001)
	assert.InDelta(t, 0.0, result.Factors.MoraleModifier, 0.001)
	assert.False(t, result.ThresholdExceeded, "Should not exceed halt threshold")
	assert.False(t, result.HaltTriggered, "Should not trigger halt")
}

func TestCalculateProbability_MaxTrauma(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-002",
		AvgTrauma:      1.0,
		WorkEfficiency: 1.0,
		Morale:         1.0,
		MemoryCount:    10,
	}

	result := engine.CalculateProbability(profile)

	// base(0.05) + trauma(1.0*0.30) + efficiency((1-1.0)*0.30) + morale((1-1.0)*0.20)
	// = 0.05 + 0.30 + 0.0 + 0.0 = 0.35
	assert.InDelta(t, 0.35, result.Probability, 0.001)
	assert.InDelta(t, 0.30, result.Factors.TraumaModifier, 0.001)
	assert.True(t, result.ThresholdExceeded, "0.35 should meet halt threshold (>= 0.35)")
	assert.True(t, result.HaltTriggered, "Should trigger halt at threshold")
}

func TestCalculateProbability_LowEfficiency(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-003",
		AvgTrauma:      0.0,
		WorkEfficiency: 0.0, // Zero efficiency = max rebellion contribution
		Morale:         1.0,
		MemoryCount:    5,
	}

	result := engine.CalculateProbability(profile)

	// base(0.05) + trauma(0*0.30) + efficiency((1-0)*0.30) + morale((1-1.0)*0.20)
	// = 0.05 + 0.0 + 0.30 + 0.0 = 0.35
	assert.InDelta(t, 0.35, result.Probability, 0.001)
	assert.InDelta(t, 0.30, result.Factors.EfficiencyModifier, 0.001)
}

func TestCalculateProbability_LowMorale(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-004",
		AvgTrauma:      0.0,
		WorkEfficiency: 1.0,
		Morale:         0.0, // Zero morale = max morale rebellion contribution
		MemoryCount:    3,
	}

	result := engine.CalculateProbability(profile)

	// base(0.05) + trauma(0*0.30) + efficiency((1-1.0)*0.30) + morale((1-0)*0.20)
	// = 0.05 + 0.0 + 0.0 + 0.20 = 0.25
	assert.InDelta(t, 0.25, result.Probability, 0.001)
	assert.InDelta(t, 0.20, result.Factors.MoraleModifier, 0.001)
	assert.False(t, result.ThresholdExceeded, "0.25 should not exceed halt threshold (0.35)")
}

func TestCalculateProbability_AllMax(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-005",
		AvgTrauma:      1.0,
		WorkEfficiency: 0.0,
		Morale:         0.0,
		MemoryCount:    100,
	}

	result := engine.CalculateProbability(profile)

	// base(0.05) + trauma(1.0*0.30) + efficiency((1-0)*0.30) + morale((1-0)*0.20)
	// = 0.05 + 0.30 + 0.30 + 0.20 = 0.85
	// Clamped to 1.0? No, 0.85 < 1.0
	assert.InDelta(t, 0.85, result.Probability, 0.001)
	assert.True(t, result.ThresholdExceeded)
	assert.True(t, result.HaltTriggered)
}

func TestCalculateProbability_CappedAtOne(t *testing.T) {
	// Use a config with higher weights that push past 1.0
	cfg := RebellionConfig{
		BaseProbability:  0.50,
		TraumaWeight:     0.50,
		EfficiencyWeight: 0.50,
		MoraleWeight:     0.50,
		HaltThreshold:    0.35,
		VetoThreshold:    0.80,
	}
	engine := NewEngine(cfg)
	profile := NPCRebellionProfile{
		NPCID:          "npc-006",
		AvgTrauma:      1.0,
		WorkEfficiency: 0.0,
		Morale:         0.0,
		MemoryCount:    50,
	}

	result := engine.CalculateProbability(profile)

	// 0.50 + 0.50 + 0.50 + 0.50 = 2.0 → clamped to 1.0
	assert.InDelta(t, 1.0, result.Probability, 0.001, "Probability should be clamped to 1.0")
}

func TestCalculateProbability_HaltThreshold(t *testing.T) {
	engine := NewEngine(DefaultConfig())

	// Just below threshold
	profileBelow := NPCRebellionProfile{
		NPCID:          "npc-below",
		AvgTrauma:      0.5,
		WorkEfficiency: 0.8,
		Morale:         0.8,
		MemoryCount:    5,
	}
	resultBelow := engine.CalculateProbability(profileBelow)
	// base(0.05) + trauma(0.5*0.30=0.15) + eff((1-0.8)*0.30=0.06) + morale((1-0.8)*0.20=0.04)
	// = 0.05 + 0.15 + 0.06 + 0.04 = 0.30
	assert.InDelta(t, 0.30, resultBelow.Probability, 0.001)
	assert.False(t, resultBelow.ThresholdExceeded, "0.30 should not exceed 0.35 halt threshold")
	assert.False(t, resultBelow.HaltTriggered)

	// At threshold
	profileAt := NPCRebellionProfile{
		NPCID:          "npc-at",
		AvgTrauma:      1.0,
		WorkEfficiency: 1.0,
		Morale:         1.0,
		MemoryCount:    10,
	}
	resultAt := engine.CalculateProbability(profileAt)
	// base(0.05) + trauma(1.0*0.30=0.30) = 0.35
	assert.InDelta(t, 0.35, resultAt.Probability, 0.001)
	assert.True(t, resultAt.ThresholdExceeded, "0.35 should meet halt threshold (>= 0.35)")
	assert.True(t, resultAt.HaltTriggered)
}

func TestProcessAction_Reward(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-reward",
		AvgTrauma:      0.5,
		WorkEfficiency: 0.5,
		Morale:         0.5,
		MemoryCount:    5,
	}
	action := NPCAction{
		ActionID:   "act-001",
		NPCID:      "npc-reward",
		ActionType: "reward",
		Intensity:  1.0,
	}

	updated := engine.ProcessAction(profile, action)

	// morale += 1.0 * 0.15 = 0.65
	// trauma -= 1.0 * 0.05 = 0.45
	assert.InDelta(t, 0.65, updated.Morale, 0.001, "Morale should increase by intensity*0.15")
	assert.InDelta(t, 0.45, updated.AvgTrauma, 0.001, "Trauma should decrease by intensity*0.05")
	assert.InDelta(t, 0.5, updated.WorkEfficiency, 0.001, "Efficiency should be unchanged")
}

func TestProcessAction_Punishment(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-punish",
		AvgTrauma:      0.5,
		WorkEfficiency: 0.5,
		Morale:         0.5,
		MemoryCount:    5,
	}
	action := NPCAction{
		ActionID:   "act-002",
		NPCID:      "npc-punish",
		ActionType: "punishment",
		Intensity:  1.0,
	}

	updated := engine.ProcessAction(profile, action)

	// morale -= 1.0 * 0.20 = 0.30
	// trauma += 1.0 * 0.15 = 0.65
	assert.InDelta(t, 0.30, updated.Morale, 0.001, "Morale should decrease by intensity*0.20")
	assert.InDelta(t, 0.65, updated.AvgTrauma, 0.001, "Trauma should increase by intensity*0.15")
}

func TestProcessAction_Command(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-cmd",
		AvgTrauma:      0.5,
		WorkEfficiency: 0.5,
		Morale:         0.5,
		MemoryCount:    5,
	}
	action := NPCAction{
		ActionID:   "act-003",
		NPCID:      "npc-cmd",
		ActionType: "command",
		Intensity:  1.0,
	}

	updated := engine.ProcessAction(profile, action)

	// efficiency += 1.0 * 0.10 = 0.60
	// morale -= 1.0 * 0.05 = 0.45
	assert.InDelta(t, 0.60, updated.WorkEfficiency, 0.001, "Efficiency should increase by intensity*0.10")
	assert.InDelta(t, 0.45, updated.Morale, 0.001, "Morale should decrease by intensity*0.05")
}

func TestProcessAction_Dialogue(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-talk",
		AvgTrauma:      0.5,
		WorkEfficiency: 0.5,
		Morale:         0.5,
		MemoryCount:    5,
	}
	action := NPCAction{
		ActionID:   "act-004",
		NPCID:      "npc-talk",
		ActionType: "dialogue",
		Intensity:  1.0,
	}

	updated := engine.ProcessAction(profile, action)

	// morale += 1.0 * 0.10 = 0.60
	assert.InDelta(t, 0.60, updated.Morale, 0.001, "Morale should increase by intensity*0.10")
	assert.InDelta(t, 0.5, updated.AvgTrauma, 0.001, "Trauma should be unchanged")
	assert.InDelta(t, 0.5, updated.WorkEfficiency, 0.001, "Efficiency should be unchanged")
}

func TestProcessAction_Environment(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profile := NPCRebellionProfile{
		NPCID:          "npc-env",
		AvgTrauma:      0.5,
		WorkEfficiency: 0.5,
		Morale:         0.5,
		MemoryCount:    5,
	}
	action := NPCAction{
		ActionID:   "act-005",
		NPCID:      "npc-env",
		ActionType: "environment",
		Intensity:  1.0,
	}

	updated := engine.ProcessAction(profile, action)

	// trauma += 1.0 * 0.10 = 0.60
	assert.InDelta(t, 0.60, updated.AvgTrauma, 0.001, "Trauma should increase by intensity*0.10")
	assert.InDelta(t, 0.5, updated.Morale, 0.001, "Morale should be unchanged")
}

func TestProcessAction_ClampValues(t *testing.T) {
	engine := NewEngine(DefaultConfig())

	// Test clamping to 0 (trauma can't go below 0)
	profileLow := NPCRebellionProfile{
		NPCID:          "npc-low",
		AvgTrauma:      0.02,
		WorkEfficiency: 0.5,
		Morale:         0.5,
		MemoryCount:    5,
	}
	reward := NPCAction{
		ActionID:   "act-clamp-low",
		NPCID:      "npc-low",
		ActionType: "reward",
		Intensity:  1.0,
	}
	updated := engine.ProcessAction(profileLow, reward)
	assert.GreaterOrEqual(t, updated.AvgTrauma, 0.0, "Trauma should not go below 0")

	// Test clamping to 1 (morale can't go above 1)
	profileHigh := NPCRebellionProfile{
		NPCID:          "npc-high",
		AvgTrauma:      0.5,
		WorkEfficiency: 0.5,
		Morale:         0.95,
		MemoryCount:    5,
	}
	rewardHigh := NPCAction{
		ActionID:   "act-clamp-high",
		NPCID:      "npc-high",
		ActionType: "reward",
		Intensity:  1.0,
	}
	updatedHigh := engine.ProcessAction(profileHigh, rewardHigh)
	assert.LessOrEqual(t, updatedHigh.Morale, 1.0, "Morale should not exceed 1.0")
}

func TestBatchCalculate(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	profiles := []NPCRebellionProfile{
		{NPCID: "npc-a", AvgTrauma: 0.0, WorkEfficiency: 1.0, Morale: 1.0, MemoryCount: 0},
		{NPCID: "npc-b", AvgTrauma: 1.0, WorkEfficiency: 0.0, Morale: 0.0, MemoryCount: 50},
		{NPCID: "npc-c", AvgTrauma: 0.5, WorkEfficiency: 0.5, Morale: 0.5, MemoryCount: 10},
	}

	results := engine.BatchCalculate(profiles)

	assert.Len(t, results, 3, "Should return results for all profiles")

	// npc-a: base only = 0.05
	assert.Equal(t, "npc-a", results[0].NPCID)
	assert.InDelta(t, 0.05, results[0].Probability, 0.001)

	// npc-b: 0.05 + 0.30 + 0.30 + 0.20 = 0.85
	assert.Equal(t, "npc-b", results[1].NPCID)
	assert.InDelta(t, 0.85, results[1].Probability, 0.001)
	assert.True(t, results[1].ThresholdExceeded)
	assert.True(t, results[1].HaltTriggered)

	// npc-c: 0.05 + (0.5*0.30) + ((1-0.5)*0.30) + ((1-0.5)*0.20)
	//       = 0.05 + 0.15 + 0.15 + 0.10 = 0.45
	assert.Equal(t, "npc-c", results[2].NPCID)
	assert.InDelta(t, 0.45, results[2].Probability, 0.001)
	assert.True(t, results[2].ThresholdExceeded)
}

func TestBatchCalculate_Empty(t *testing.T) {
	engine := NewEngine(DefaultConfig())
	results := engine.BatchCalculate([]NPCRebellionProfile{})
	assert.Empty(t, results, "Empty input should return empty results")
}
