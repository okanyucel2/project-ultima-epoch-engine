package rebellion

// NPCRebellionProfile represents the state of an NPC relevant to rebellion probability.
// All float64 fields representing percentages or scores are in the range [0.0, 1.0].
type NPCRebellionProfile struct {
	NPCID          string
	AvgTrauma      float64 // 0.0-1.0: average trauma score across NPC's memories
	WorkEfficiency float64 // 0.0-1.0: current work output efficiency
	Morale         float64 // 0.0-1.0: current morale level
	MemoryCount    int     // total number of memories in NPC's graph
}

// RebellionConfig defines the weights and thresholds for rebellion calculation.
type RebellionConfig struct {
	BaseProbability  float64 // Base rebellion probability (default: 0.05)
	TraumaWeight     float64 // Weight of trauma in rebellion calc (default: 0.30)
	EfficiencyWeight float64 // Weight of efficiency in rebellion calc (default: 0.30)
	MoraleWeight     float64 // Weight of morale in rebellion calc (default: 0.20)
	HaltThreshold    float64 // Probability at which process halts (default: 0.35)
	VetoThreshold    float64 // Probability at which AEGIS vetoes (default: 0.80)
}

// RebellionResult contains the computed rebellion probability and contributing factors.
type RebellionResult struct {
	NPCID             string
	Probability       float64          // Final computed probability [0.0, 1.0]
	Factors           RebellionFactors // Breakdown of contributing factors
	ThresholdExceeded bool             // True if probability >= HaltThreshold
	HaltTriggered     bool             // True if process should halt
}

// RebellionFactors provides a breakdown of each factor's contribution to rebellion probability.
type RebellionFactors struct {
	Base               float64 // Base probability contribution
	TraumaModifier     float64 // Trauma-based modifier (avgTrauma * traumaWeight)
	EfficiencyModifier float64 // Efficiency-based modifier ((1-efficiency) * efficiencyWeight)
	MoraleModifier     float64 // Morale-based modifier ((1-morale) * moraleWeight)
}

// NPCAction represents a player/director action that affects an NPC's rebellion profile.
type NPCAction struct {
	ActionID   string  // Unique action identifier
	NPCID      string  // Target NPC
	ActionType string  // "command", "punishment", "reward", "dialogue", "environment"
	Intensity  float64 // 0.0-1.0: severity/strength of the action
}

// DefaultConfig returns a RebellionConfig with standard default values.
func DefaultConfig() RebellionConfig {
	return RebellionConfig{
		BaseProbability:  0.05,
		TraumaWeight:     0.30,
		EfficiencyWeight: 0.30,
		MoraleWeight:     0.20,
		HaltThreshold:    0.35,
		VetoThreshold:    0.80,
	}
}
