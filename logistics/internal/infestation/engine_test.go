package infestation

import (
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.AccumulationRate != 2.0 {
		t.Errorf("AccumulationRate = %v, want 2.0", cfg.AccumulationRate)
	}
	if cfg.DecayRate != 1.0 {
		t.Errorf("DecayRate = %v, want 1.0", cfg.DecayRate)
	}
	if cfg.PlagueHeartThreshold != 100 {
		t.Errorf("PlagueHeartThreshold = %v, want 100", cfg.PlagueHeartThreshold)
	}
	if cfg.ClearThreshold != 75 {
		t.Errorf("ClearThreshold = %v, want 75", cfg.ClearThreshold)
	}
	if cfg.ThrottleAmount != 0.50 {
		t.Errorf("ThrottleAmount = %v, want 0.50", cfg.ThrottleAmount)
	}
}

func TestNewEngine(t *testing.T) {
	e := NewEngine(DefaultConfig())
	state := e.GetState()
	if state.Counter != 0 {
		t.Errorf("initial Counter = %v, want 0", state.Counter)
	}
	if state.IsPlagueHeart {
		t.Error("initial IsPlagueHeart should be false")
	}
	if state.ThrottleMultiplier != 1.0 {
		t.Errorf("initial ThrottleMultiplier = %v, want 1.0", state.ThrottleMultiplier)
	}
}

func TestAccumulation(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Both conditions met: rebellion=0.50 > 0.35, trauma=0.50 > 0.40
	result := e.Tick(0.50, 0.50, 1)
	if !result.Accumulated {
		t.Error("expected accumulation when both conditions met")
	}
	if result.NewCounter != 2.0 {
		t.Errorf("NewCounter = %v, want 2.0", result.NewCounter)
	}
	if result.PreviousCounter != 0 {
		t.Errorf("PreviousCounter = %v, want 0", result.PreviousCounter)
	}
}

func TestDecay(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Manually accumulate first
	e.Tick(0.50, 0.50, 1) // counter = 2.0

	// Now only rebellion is high, trauma is low → decay
	result := e.Tick(0.50, 0.30, 2)
	if result.Accumulated {
		t.Error("should not accumulate when trauma condition not met")
	}
	if result.NewCounter != 1.0 {
		t.Errorf("NewCounter = %v, want 1.0 (2.0 - 1.0 decay)", result.NewCounter)
	}
}

func TestClampAtZero(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Decay from 0 should stay at 0
	result := e.Tick(0.10, 0.10, 1)
	if result.NewCounter != 0 {
		t.Errorf("NewCounter = %v, want 0 (clamped)", result.NewCounter)
	}
}

func TestClampAtMax(t *testing.T) {
	cfg := DefaultConfig()
	e := NewEngine(cfg)
	// Fill to 100 first
	for i := 0; i < 50; i++ {
		e.Tick(0.50, 0.50, int64(i+1))
	}
	state := e.GetState()
	if state.Counter != 100 {
		t.Errorf("Counter after 50 ticks = %v, want 100", state.Counter)
	}

	// One more tick should stay at 100
	result := e.Tick(0.50, 0.50, 51)
	if result.NewCounter != 100 {
		t.Errorf("NewCounter = %v, want 100 (clamped at max)", result.NewCounter)
	}
}

func TestPlagueHeartActivation(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Fill to 100 in 50 ticks
	var lastResult InfestationTickResult
	for i := 0; i < 50; i++ {
		lastResult = e.Tick(0.50, 0.50, int64(i+1))
	}
	if !lastResult.PlagueHeartActive {
		t.Error("Plague Heart should be active at counter=100")
	}
	if !lastResult.PlagueHeartChanged {
		t.Error("PlagueHeartChanged should be true on activation tick")
	}

	state := e.GetState()
	if state.ThrottleMultiplier != 0.50 {
		t.Errorf("ThrottleMultiplier = %v, want 0.50", state.ThrottleMultiplier)
	}
}

func TestHysteresisStaysActiveAt99(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Fill to 100
	for i := 0; i < 50; i++ {
		e.Tick(0.50, 0.50, int64(i+1))
	}
	// One decay tick: 100 → 99. Should stay active (hysteresis: needs < 75)
	result := e.Tick(0.10, 0.10, 51)
	if result.NewCounter != 99 {
		t.Errorf("NewCounter = %v, want 99", result.NewCounter)
	}
	if !result.PlagueHeartActive {
		t.Error("Plague Heart should remain active at 99 (hysteresis)")
	}
	if result.PlagueHeartChanged {
		t.Error("PlagueHeartChanged should be false (still active)")
	}
}

func TestHysteresisStaysActiveAt75(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Fill to 100
	for i := 0; i < 50; i++ {
		e.Tick(0.50, 0.50, int64(i+1))
	}
	// Decay 25 ticks: 100 → 75
	for i := 0; i < 25; i++ {
		e.Tick(0.10, 0.10, int64(51+i))
	}
	state := e.GetState()
	if state.Counter != 75 {
		t.Errorf("Counter = %v, want 75", state.Counter)
	}
	if !state.IsPlagueHeart {
		t.Error("Plague Heart should still be active at 75 (needs < 75 to clear)")
	}
}

func TestHysteresisClearsBelow75(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Fill to 100
	for i := 0; i < 50; i++ {
		e.Tick(0.50, 0.50, int64(i+1))
	}
	// Decay 26 ticks: 100 → 74
	for i := 0; i < 26; i++ {
		e.Tick(0.10, 0.10, int64(51+i))
	}
	state := e.GetState()
	if state.Counter != 74 {
		t.Errorf("Counter = %v, want 74", state.Counter)
	}
	if state.IsPlagueHeart {
		t.Error("Plague Heart should be cleared at 74 (below 75 threshold)")
	}
	if state.ThrottleMultiplier != 1.0 {
		t.Errorf("ThrottleMultiplier = %v, want 1.0 after clear", state.ThrottleMultiplier)
	}
}

func TestNoAccumulationOnlyRebellion(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// High rebellion but low trauma → no accumulation
	result := e.Tick(0.80, 0.10, 1)
	if result.Accumulated {
		t.Error("should not accumulate when only rebellion condition met")
	}
}

func TestNoAccumulationOnlyTrauma(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Low rebellion but high trauma → no accumulation
	result := e.Tick(0.10, 0.80, 1)
	if result.Accumulated {
		t.Error("should not accumulate when only trauma condition met")
	}
}

func Test50TicksToFullActivation(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// 2.0/tick × 50 ticks = 100 exactly
	for i := 0; i < 49; i++ {
		e.Tick(0.50, 0.50, int64(i+1))
	}
	state := e.GetState()
	if state.Counter != 98 {
		t.Errorf("Counter after 49 ticks = %v, want 98", state.Counter)
	}
	if state.IsPlagueHeart {
		t.Error("Plague Heart should NOT be active at 98")
	}

	// 50th tick → 100 → activate
	result := e.Tick(0.50, 0.50, 50)
	if result.NewCounter != 100 {
		t.Errorf("NewCounter at tick 50 = %v, want 100", result.NewCounter)
	}
	if !result.PlagueHeartActive {
		t.Error("Plague Heart should activate at tick 50")
	}
}

func TestCleanse_Success(t *testing.T) {
	e := NewEngine(DefaultConfig())
	// Fill to 100 → activate plague heart
	for i := 0; i < 50; i++ {
		e.Tick(0.50, 0.50, int64(i+1))
	}
	state := e.GetState()
	if !state.IsPlagueHeart {
		t.Fatal("Expected Plague Heart to be active at 100")
	}

	// Cleanse
	err := e.Cleanse()
	if err != nil {
		t.Fatalf("Cleanse() returned unexpected error: %v", err)
	}

	state = e.GetState()
	if state.Counter != 0 {
		t.Errorf("Counter after cleanse = %v, want 0", state.Counter)
	}
	if state.IsPlagueHeart {
		t.Error("IsPlagueHeart should be false after cleanse")
	}
	if state.ThrottleMultiplier != 1.0 {
		t.Errorf("ThrottleMultiplier after cleanse = %v, want 1.0", state.ThrottleMultiplier)
	}
}

func TestCleanse_NotActive(t *testing.T) {
	e := NewEngine(DefaultConfig())
	err := e.Cleanse()
	if err == nil {
		t.Error("Cleanse() should return error when Plague Heart is not active")
	}
}

func TestResultFieldsPopulated(t *testing.T) {
	e := NewEngine(DefaultConfig())
	result := e.Tick(0.50, 0.50, 42)
	if result.PreviousCounter != 0 {
		t.Errorf("PreviousCounter = %v, want 0", result.PreviousCounter)
	}
	if result.NewCounter != 2.0 {
		t.Errorf("NewCounter = %v, want 2.0", result.NewCounter)
	}
	if !result.Accumulated {
		t.Error("Accumulated should be true")
	}
	if result.PlagueHeartChanged {
		t.Error("PlagueHeartChanged should be false (no toggle)")
	}
	if result.PlagueHeartActive {
		t.Error("PlagueHeartActive should be false at counter=2")
	}

	state := e.GetState()
	if state.LastTick != 42 {
		t.Errorf("LastTick = %v, want 42", state.LastTick)
	}
}
