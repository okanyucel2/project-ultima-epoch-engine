package simulation

import (
	"testing"

	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/rebellion"
	"github.com/stretchr/testify/assert"
)

func TestNewSimulationEngine(t *testing.T) {
	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	sim := NewSimulationEngine(rebEngine)

	status := sim.GetStatus()
	assert.Equal(t, 0, status.Refineries)
	assert.Equal(t, 0, status.Mines)
	assert.Equal(t, 0, status.ActiveNPCs)
	assert.Equal(t, int64(0), status.TickCount)
	assert.InDelta(t, 0.0, status.OverallRebellionProb, 0.001)
	assert.NotNil(t, status.Resources)

	// All resources should start at 0 quantity
	for _, res := range status.Resources {
		assert.InDelta(t, 0.0, res.Quantity, 0.001)
	}
}

func TestTick_ResourceProduction(t *testing.T) {
	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	sim := NewSimulationEngine(rebEngine)

	// Add a mine to produce minerals
	sim.AddMine(10.0)

	status := sim.Tick()

	assert.Equal(t, int64(1), status.TickCount)
	// Mine produces minerals at yieldRate
	mineralState, ok := status.Resources[ResourceMineral]
	assert.True(t, ok, "Mineral resource should exist")
	assert.InDelta(t, 10.0, mineralState.Quantity, 0.001, "Mineral should increase by mine yield rate")
}

func TestTick_ResourceConsumption(t *testing.T) {
	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	sim := NewSimulationEngine(rebEngine)

	// Add a mine to produce minerals, then a refinery that consumes them
	sim.AddMine(20.0)
	sim.AddRefinery(0.5)

	// First tick: produce minerals and consume some
	status := sim.Tick()

	mineralState := status.Resources[ResourceMineral]
	rapidlumState := status.Resources[ResourceRapidlum]

	// Mine produces 20 mineral per tick
	// Refinery consumes mineral (efficiency * 10 = 5.0 mineral per tick)
	// Refinery produces rapidlum (efficiency * 5 = 2.5 per tick)
	assert.True(t, mineralState.Quantity > 0, "Mineral should be positive after first tick")
	assert.True(t, rapidlumState.Quantity > 0, "Rapidlum should be produced by refinery")
}

func TestAddMine(t *testing.T) {
	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	sim := NewSimulationEngine(rebEngine)

	mineID := sim.AddMine(15.0)
	assert.NotEmpty(t, mineID, "Should return a mine ID")

	status := sim.GetStatus()
	assert.Equal(t, 1, status.Mines)

	// Add another
	sim.AddMine(20.0)
	status = sim.GetStatus()
	assert.Equal(t, 2, status.Mines)
}

func TestAddRefinery(t *testing.T) {
	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	sim := NewSimulationEngine(rebEngine)

	refID := sim.AddRefinery(0.8)
	assert.NotEmpty(t, refID, "Should return a refinery ID")

	status := sim.GetStatus()
	assert.Equal(t, 1, status.Refineries)

	// Add another
	sim.AddRefinery(0.5)
	status = sim.GetStatus()
	assert.Equal(t, 2, status.Refineries)
}

func TestMultipleTicks(t *testing.T) {
	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	sim := NewSimulationEngine(rebEngine)

	sim.AddMine(10.0)

	// Run 5 ticks
	var status SimulationStatus
	for i := 0; i < 5; i++ {
		status = sim.Tick()
	}

	assert.Equal(t, int64(5), status.TickCount)

	mineralState := status.Resources[ResourceMineral]
	// 5 ticks * 10.0 yield = 50.0 minerals (no consumption)
	assert.InDelta(t, 50.0, mineralState.Quantity, 0.001, "Minerals should accumulate over ticks")
}

func TestTick_SimResourceProduction(t *testing.T) {
	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	sim := NewSimulationEngine(rebEngine)

	// Sim resource gets a base production rate
	status := sim.Tick()
	simState := status.Resources[ResourceSim]
	// Base sim production is 1.0 per tick
	assert.InDelta(t, 1.0, simState.Quantity, 0.001, "Sim should have base production")
}

func TestGetStatus_ThreadSafety(t *testing.T) {
	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	sim := NewSimulationEngine(rebEngine)

	sim.AddMine(10.0)

	// Run concurrent reads and writes
	done := make(chan bool, 10)
	for i := 0; i < 5; i++ {
		go func() {
			sim.Tick()
			done <- true
		}()
		go func() {
			sim.GetStatus()
			done <- true
		}()
	}

	for i := 0; i < 10; i++ {
		<-done
	}

	// If we got here without race condition, the test passes
	status := sim.GetStatus()
	assert.True(t, status.TickCount >= 0, "TickCount should be non-negative")
}
