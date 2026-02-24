package infestation

import (
	"errors"
	"sync"
)

// Engine manages infestation state: accumulation when rebellion+trauma are high,
// decay otherwise, with hysteresis for Plague Heart activation/deactivation.
type Engine struct {
	state  InfestationState
	config InfestationConfig
	mu     sync.RWMutex
}

// NewEngine creates an infestation engine with the given config.
func NewEngine(config InfestationConfig) *Engine {
	return &Engine{
		state: InfestationState{
			Counter:            0,
			IsPlagueHeart:      false,
			ThrottleMultiplier: 1.0,
			LastTick:           0,
		},
		config: config,
	}
}

// Tick advances the infestation engine by one tick.
// If avgRebellion > RebellionTrigger AND avgTrauma > TraumaTrigger,
// counter increases by AccumulationRate. Otherwise, it decays by DecayRate.
// Counter is clamped to [0, PlagueHeartThreshold].
// Plague Heart activates at PlagueHeartThreshold and clears below ClearThreshold (hysteresis).
func (e *Engine) Tick(avgRebellion, avgTrauma float64, tickNumber int64) InfestationTickResult {
	e.mu.Lock()
	defer e.mu.Unlock()

	previous := e.state.Counter
	previousPlagueHeart := e.state.IsPlagueHeart
	accumulated := false

	// Accumulate or decay
	if avgRebellion > e.config.RebellionTrigger && avgTrauma > e.config.TraumaTrigger {
		e.state.Counter += e.config.AccumulationRate
		accumulated = true
	} else {
		e.state.Counter -= e.config.DecayRate
	}

	// Clamp [0, PlagueHeartThreshold]
	if e.state.Counter < 0 {
		e.state.Counter = 0
	}
	if e.state.Counter > e.config.PlagueHeartThreshold {
		e.state.Counter = e.config.PlagueHeartThreshold
	}

	// Plague Heart activation with hysteresis
	if !e.state.IsPlagueHeart && e.state.Counter >= e.config.PlagueHeartThreshold {
		e.state.IsPlagueHeart = true
		e.state.ThrottleMultiplier = e.config.ThrottleAmount
	} else if e.state.IsPlagueHeart && e.state.Counter < e.config.ClearThreshold {
		e.state.IsPlagueHeart = false
		e.state.ThrottleMultiplier = 1.0
	}

	e.state.LastTick = tickNumber

	return InfestationTickResult{
		PreviousCounter:    previous,
		NewCounter:         e.state.Counter,
		Accumulated:        accumulated,
		PlagueHeartChanged: previousPlagueHeart != e.state.IsPlagueHeart,
		PlagueHeartActive:  e.state.IsPlagueHeart,
	}
}

// GetState returns a snapshot of the current infestation state.
func (e *Engine) GetState() InfestationState {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.state
}

// GetConfig returns the engine's configuration.
func (e *Engine) GetConfig() InfestationConfig {
	return e.config
}

// Cleanse resets the infestation state after a successful Sheriff Protocol operation.
// Returns error if Plague Heart is not currently active.
func (e *Engine) Cleanse() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.state.IsPlagueHeart {
		return errors.New("cannot cleanse: Plague Heart is not active")
	}

	e.state.Counter = 0
	e.state.IsPlagueHeart = false
	e.state.ThrottleMultiplier = 1.0
	return nil
}
