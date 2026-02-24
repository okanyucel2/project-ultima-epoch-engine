package cleansing

import (
	"errors"
	"math"
	"math/rand"
)

// CleansingParticipant represents an NPC participating in a Sheriff cleansing operation.
type CleansingParticipant struct {
	NPCID      string
	Role       string  // "warrior" or "guard"
	AvgTrauma  float64 // 0-1
	Morale     float64 // 0-1
	Confidence float64 // 0-1
}

// CleansingConfig defines the tuning parameters for cleansing success calculation.
type CleansingConfig struct {
	BaseSuccessRate     float64 // Base probability before modifiers (default: 0.50)
	MoraleWeight        float64 // How much avg morale contributes (default: 0.25)
	TraumaPenaltyWeight float64 // How much avg trauma penalizes (default: 0.30)
	ConfidenceWeight    float64 // How much avg confidence contributes (default: 0.15)
	MinSuccessRate      float64 // Floor for success rate (default: 0.20)
	MaxSuccessRate      float64 // Ceiling for success rate (default: 0.85)
	MinParticipants     int     // Minimum NPCs required (default: 2)
}

// CleansingResult captures the outcome of a cleansing operation.
type CleansingResult struct {
	Success          bool
	SuccessRate      float64
	Participants     []string
	ParticipantCount int
	RolledValue      float64
	Factors          CleansingFactors
}

// CleansingFactors provides a detailed breakdown of success rate calculation.
type CleansingFactors struct {
	BaseFactor             float64
	AvgMorale              float64
	MoraleContrib          float64
	AvgTrauma              float64
	TraumaPenalty          float64
	AvgConfidence          float64
	ConfidenceContrib      float64
}

// DefaultConfig returns balanced default cleansing configuration.
func DefaultConfig() CleansingConfig {
	return CleansingConfig{
		BaseSuccessRate:     0.50,
		MoraleWeight:        0.25,
		TraumaPenaltyWeight: 0.30,
		ConfidenceWeight:    0.15,
		MinSuccessRate:      0.20,
		MaxSuccessRate:      0.85,
		MinParticipants:     2,
	}
}

// Engine executes Sheriff Protocol cleansing operations.
type Engine struct {
	config CleansingConfig
	randFn func() float64
}

// NewEngine creates a new cleansing engine with the given configuration.
func NewEngine(config CleansingConfig) *Engine {
	return &Engine{
		config: config,
		randFn: rand.Float64,
	}
}

// SetRandFn injects a deterministic random function for testing.
func (e *Engine) SetRandFn(fn func() float64) {
	e.randFn = fn
}

// CalculateSuccessRate computes the cleansing success probability from participant stats.
// Formula: clamp(base + avgMorale*moraleWeight - avgTrauma*traumaPenalty + avgConfidence*confWeight, min, max)
func (e *Engine) CalculateSuccessRate(participants []CleansingParticipant) (float64, CleansingFactors) {
	if len(participants) == 0 {
		return e.config.MinSuccessRate, CleansingFactors{BaseFactor: e.config.BaseSuccessRate}
	}

	var totalMorale, totalTrauma, totalConfidence float64
	for _, p := range participants {
		totalMorale += p.Morale
		totalTrauma += p.AvgTrauma
		totalConfidence += p.Confidence
	}

	n := float64(len(participants))
	avgMorale := totalMorale / n
	avgTrauma := totalTrauma / n
	avgConfidence := totalConfidence / n

	moraleContrib := avgMorale * e.config.MoraleWeight
	traumaPenalty := avgTrauma * e.config.TraumaPenaltyWeight
	confidenceContrib := avgConfidence * e.config.ConfidenceWeight

	raw := e.config.BaseSuccessRate + moraleContrib - traumaPenalty + confidenceContrib
	clamped := math.Max(e.config.MinSuccessRate, math.Min(e.config.MaxSuccessRate, raw))

	factors := CleansingFactors{
		BaseFactor:        e.config.BaseSuccessRate,
		AvgMorale:         avgMorale,
		MoraleContrib:     moraleContrib,
		AvgTrauma:         avgTrauma,
		TraumaPenalty:     traumaPenalty,
		AvgConfidence:     avgConfidence,
		ConfidenceContrib: confidenceContrib,
	}

	return clamped, factors
}

// Execute runs a full cleansing operation. Returns error if plague heart is not active
// or if there are insufficient participants.
func (e *Engine) Execute(participants []CleansingParticipant, isPlagueHeart bool) (CleansingResult, error) {
	if !isPlagueHeart {
		return CleansingResult{}, errors.New("cannot cleanse: Plague Heart is not active")
	}

	if len(participants) < e.config.MinParticipants {
		return CleansingResult{}, errors.New("cannot cleanse: insufficient participants (minimum 2 warriors/guards required)")
	}

	successRate, factors := e.CalculateSuccessRate(participants)
	rolled := e.randFn()

	ids := make([]string, len(participants))
	for i, p := range participants {
		ids[i] = p.NPCID
	}

	return CleansingResult{
		Success:          rolled <= successRate,
		SuccessRate:      successRate,
		Participants:     ids,
		ParticipantCount: len(participants),
		RolledValue:      rolled,
		Factors:          factors,
	}, nil
}
