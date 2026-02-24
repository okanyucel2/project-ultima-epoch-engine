package infestation

// InfestationState represents the current plague heart infestation level.
// Counter ranges from 0-100. At 100, Plague Heart activates and throttles production.
type InfestationState struct {
	Counter            float64 // 0-100: current infestation level
	IsPlagueHeart      bool    // true when counter >= PlagueHeartThreshold
	ThrottleMultiplier float64 // 1.0 normal, ThrottleAmount when plague heart active
	LastTick           int64   // tick when last updated
}

// InfestationConfig defines accumulation/decay rates and thresholds.
type InfestationConfig struct {
	AccumulationRate      float64 // Counter increase per tick when conditions met (default: 2.0)
	DecayRate             float64 // Counter decrease per tick when conditions not met (default: 1.0)
	PlagueHeartThreshold  float64 // Counter value to activate plague heart (default: 100)
	ClearThreshold        float64 // Counter must drop below this to clear plague heart (hysteresis, default: 75)
	ThrottleAmount        float64 // Production multiplier when plague heart active (default: 0.50)
	RebellionTrigger      float64 // Avg rebellion must exceed this for accumulation (default: 0.35)
	TraumaTrigger         float64 // Avg trauma must exceed this for accumulation (default: 0.40)
}

// InfestationTickResult describes what happened in a single infestation tick.
type InfestationTickResult struct {
	PreviousCounter    float64
	NewCounter         float64
	Accumulated        bool // true if counter increased this tick
	PlagueHeartChanged bool // true if plague heart status toggled
	PlagueHeartActive  bool // current plague heart status after tick
}

// DefaultConfig returns balanced default infestation configuration.
func DefaultConfig() InfestationConfig {
	return InfestationConfig{
		AccumulationRate:     2.0,
		DecayRate:            1.0,
		PlagueHeartThreshold: 100,
		ClearThreshold:       75,
		ThrottleAmount:       0.50,
		RebellionTrigger:     0.35,
		TraumaTrigger:        0.40,
	}
}
