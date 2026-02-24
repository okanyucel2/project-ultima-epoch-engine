package cleansing

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	assert.InDelta(t, 0.50, cfg.BaseSuccessRate, 0.001)
	assert.InDelta(t, 0.25, cfg.MoraleWeight, 0.001)
	assert.InDelta(t, 0.30, cfg.TraumaPenaltyWeight, 0.001)
	assert.InDelta(t, 0.15, cfg.ConfidenceWeight, 0.001)
	assert.InDelta(t, 0.20, cfg.MinSuccessRate, 0.001)
	assert.InDelta(t, 0.85, cfg.MaxSuccessRate, 0.001)
	assert.Equal(t, 2, cfg.MinParticipants)
}

func TestHighMoraleArmy(t *testing.T) {
	e := NewEngine(DefaultConfig())
	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 0.1, Morale: 0.9, Confidence: 0.8},
		{NPCID: "w2", Role: "warrior", AvgTrauma: 0.1, Morale: 0.9, Confidence: 0.8},
		{NPCID: "g1", Role: "guard", AvgTrauma: 0.1, Morale: 0.9, Confidence: 0.8},
	}

	rate, factors := e.CalculateSuccessRate(participants)
	// base(0.50) + morale(0.9*0.25=0.225) - trauma(0.1*0.30=0.03) + conf(0.8*0.15=0.12) = 0.815
	assert.InDelta(t, 0.815, rate, 0.01, "High morale army should have ~82% success rate")
	assert.InDelta(t, 0.9, factors.AvgMorale, 0.001)
	assert.InDelta(t, 0.1, factors.AvgTrauma, 0.001)
}

func TestDepletedArmy(t *testing.T) {
	e := NewEngine(DefaultConfig())
	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 0.8, Morale: 0.2, Confidence: 0.2},
		{NPCID: "w2", Role: "warrior", AvgTrauma: 0.8, Morale: 0.2, Confidence: 0.2},
	}

	rate, _ := e.CalculateSuccessRate(participants)
	// base(0.50) + morale(0.2*0.25=0.05) - trauma(0.8*0.30=0.24) + conf(0.2*0.15=0.03) = 0.34
	// Clamped above minRate
	assert.InDelta(t, 0.34, rate, 0.01, "Depleted army should have low success rate")
	assert.True(t, rate >= 0.20, "Should be at least minRate")
}

func TestNeutralArmy(t *testing.T) {
	e := NewEngine(DefaultConfig())
	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 0.5, Morale: 0.5, Confidence: 0.5},
		{NPCID: "w2", Role: "warrior", AvgTrauma: 0.5, Morale: 0.5, Confidence: 0.5},
	}

	rate, _ := e.CalculateSuccessRate(participants)
	// base(0.50) + morale(0.5*0.25=0.125) - trauma(0.5*0.30=0.15) + conf(0.5*0.15=0.075) = 0.55
	assert.InDelta(t, 0.55, rate, 0.01, "Neutral army should be around 55%")
}

func TestExecuteSuccess(t *testing.T) {
	e := NewEngine(DefaultConfig())
	e.SetRandFn(func() float64 { return 0.1 }) // Low roll = success

	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 0.3, Morale: 0.7, Confidence: 0.6},
		{NPCID: "w2", Role: "warrior", AvgTrauma: 0.3, Morale: 0.7, Confidence: 0.6},
	}

	result, err := e.Execute(participants, true)
	require.NoError(t, err)
	assert.True(t, result.Success, "Should succeed with low roll")
	assert.InDelta(t, 0.1, result.RolledValue, 0.001)
	assert.Equal(t, 2, result.ParticipantCount)
	assert.Equal(t, []string{"w1", "w2"}, result.Participants)
}

func TestExecuteFailure(t *testing.T) {
	e := NewEngine(DefaultConfig())
	e.SetRandFn(func() float64 { return 0.99 }) // High roll = failure

	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 0.3, Morale: 0.7, Confidence: 0.6},
		{NPCID: "w2", Role: "warrior", AvgTrauma: 0.3, Morale: 0.7, Confidence: 0.6},
	}

	result, err := e.Execute(participants, true)
	require.NoError(t, err)
	assert.False(t, result.Success, "Should fail with high roll")
	assert.InDelta(t, 0.99, result.RolledValue, 0.001)
}

func TestExecuteNotPlagueHeart(t *testing.T) {
	e := NewEngine(DefaultConfig())
	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 0.3, Morale: 0.7, Confidence: 0.6},
		{NPCID: "w2", Role: "warrior", AvgTrauma: 0.3, Morale: 0.7, Confidence: 0.6},
	}

	_, err := e.Execute(participants, false)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Plague Heart is not active")
}

func TestExecuteInsufficientParticipants(t *testing.T) {
	e := NewEngine(DefaultConfig())
	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 0.3, Morale: 0.7, Confidence: 0.6},
	}

	_, err := e.Execute(participants, true)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient participants")
}

func TestClampMin(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Extreme trauma, no morale/confidence → raw rate would be very low
	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 1.0, Morale: 0.0, Confidence: 0.0},
		{NPCID: "w2", Role: "warrior", AvgTrauma: 1.0, Morale: 0.0, Confidence: 0.0},
	}

	rate, _ := e.CalculateSuccessRate(participants)
	// base(0.50) + morale(0) - trauma(1.0*0.30=0.30) + conf(0) = 0.20 → clamped to 0.20
	assert.InDelta(t, 0.20, rate, 0.001, "Should clamp to minimum success rate")
}

func TestClampMax(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Perfect stats → raw rate would exceed max
	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 0.0, Morale: 1.0, Confidence: 1.0},
		{NPCID: "w2", Role: "warrior", AvgTrauma: 0.0, Morale: 1.0, Confidence: 1.0},
	}

	rate, _ := e.CalculateSuccessRate(participants)
	// base(0.50) + morale(1.0*0.25=0.25) - trauma(0) + conf(1.0*0.15=0.15) = 0.90 → clamped to 0.85
	assert.InDelta(t, 0.85, rate, 0.001, "Should clamp to maximum success rate")
}

func TestFactorsPopulated(t *testing.T) {
	e := NewEngine(DefaultConfig())
	participants := []CleansingParticipant{
		{NPCID: "w1", Role: "warrior", AvgTrauma: 0.4, Morale: 0.6, Confidence: 0.5},
		{NPCID: "g1", Role: "guard", AvgTrauma: 0.2, Morale: 0.8, Confidence: 0.7},
	}

	_, factors := e.CalculateSuccessRate(participants)
	assert.InDelta(t, 0.50, factors.BaseFactor, 0.001)
	assert.InDelta(t, 0.70, factors.AvgMorale, 0.001)    // (0.6+0.8)/2
	assert.InDelta(t, 0.30, factors.AvgTrauma, 0.001)     // (0.4+0.2)/2
	assert.InDelta(t, 0.60, factors.AvgConfidence, 0.001) // (0.5+0.7)/2
	assert.InDelta(t, 0.175, factors.MoraleContrib, 0.001)
	assert.InDelta(t, 0.09, factors.TraumaPenalty, 0.001)
	assert.InDelta(t, 0.09, factors.ConfidenceContrib, 0.001)
}
