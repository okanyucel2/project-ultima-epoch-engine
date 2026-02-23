package rebellion

import "math"

// Engine computes rebellion probabilities and processes actions that affect NPC profiles.
type Engine struct {
	config RebellionConfig
}

// NewEngine creates a new rebellion Engine with the given configuration.
func NewEngine(config RebellionConfig) *Engine {
	return &Engine{config: config}
}

// GetConfig returns the engine's current configuration.
func (e *Engine) GetConfig() RebellionConfig {
	return e.config
}

// CalculateProbability computes rebellion probability from an NPC's profile.
//
// Formula:
//
//	probability = clamp(base + avgTrauma*traumaWeight + (1-efficiency)*efficiencyWeight + (1-morale)*moraleWeight, 0, 1)
//
// ThresholdExceeded is true when probability >= HaltThreshold.
// HaltTriggered mirrors ThresholdExceeded (process should halt).
func (e *Engine) CalculateProbability(profile NPCRebellionProfile) RebellionResult {
	factors := RebellionFactors{
		Base:               e.config.BaseProbability,
		TraumaModifier:     profile.AvgTrauma * e.config.TraumaWeight,
		EfficiencyModifier: (1.0 - profile.WorkEfficiency) * e.config.EfficiencyWeight,
		MoraleModifier:     (1.0 - profile.Morale) * e.config.MoraleWeight,
	}

	rawProbability := factors.Base + factors.TraumaModifier + factors.EfficiencyModifier + factors.MoraleModifier
	probability := clamp(rawProbability, 0.0, 1.0)

	thresholdExceeded := probability >= e.config.HaltThreshold

	return RebellionResult{
		NPCID:             profile.NPCID,
		Probability:       probability,
		Factors:           factors,
		ThresholdExceeded: thresholdExceeded,
		HaltTriggered:     thresholdExceeded,
	}
}

// ProcessAction applies an action's effects to an NPC's rebellion profile and returns
// the updated profile. All values are clamped to [0.0, 1.0].
//
// Action effects:
//   - "reward":      morale += intensity * 0.15, trauma -= intensity * 0.05
//   - "punishment":  morale -= intensity * 0.20, trauma += intensity * 0.15
//   - "command":     efficiency += intensity * 0.10, morale -= intensity * 0.05
//   - "dialogue":    morale += intensity * 0.10
//   - "environment": trauma += intensity * 0.10
func (e *Engine) ProcessAction(profile NPCRebellionProfile, action NPCAction) NPCRebellionProfile {
	updated := profile

	switch action.ActionType {
	case "reward":
		updated.Morale += action.Intensity * 0.15
		updated.AvgTrauma -= action.Intensity * 0.05

	case "punishment":
		updated.Morale -= action.Intensity * 0.20
		updated.AvgTrauma += action.Intensity * 0.15

	case "command":
		updated.WorkEfficiency += action.Intensity * 0.10
		updated.Morale -= action.Intensity * 0.05

	case "dialogue":
		updated.Morale += action.Intensity * 0.10

	case "environment":
		updated.AvgTrauma += action.Intensity * 0.10
	}

	// Clamp all values to [0.0, 1.0]
	updated.AvgTrauma = clamp(updated.AvgTrauma, 0.0, 1.0)
	updated.WorkEfficiency = clamp(updated.WorkEfficiency, 0.0, 1.0)
	updated.Morale = clamp(updated.Morale, 0.0, 1.0)

	return updated
}

// BatchCalculate computes rebellion probabilities for multiple NPCs.
func (e *Engine) BatchCalculate(profiles []NPCRebellionProfile) []RebellionResult {
	results := make([]RebellionResult, len(profiles))
	for i, profile := range profiles {
		results[i] = e.CalculateProbability(profile)
	}
	return results
}

// clamp restricts a value to the range [min, max].
func clamp(value, min, max float64) float64 {
	return math.Max(min, math.Min(max, value))
}
