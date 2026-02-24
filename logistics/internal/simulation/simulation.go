package simulation

import (
	"fmt"
	"sync"

	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/infestation"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/rebellion"
)

const (
	// baseSimProduction is the base Sim resource production per tick.
	baseSimProduction = 1.0

	// refineryMineralConsumptionBase is the base mineral consumed per refinery per tick,
	// multiplied by refinery efficiency.
	refineryMineralConsumptionBase = 10.0

	// refineryRapidlumProductionBase is the base rapidlum produced per refinery per tick,
	// multiplied by refinery efficiency.
	refineryRapidlumProductionBase = 5.0
)

// SimulationEngine manages the resource simulation, including mines, refineries,
// and resource production/consumption per tick. It is safe for concurrent use.
type SimulationEngine struct {
	status      SimulationStatus
	mines       []Mine
	refineries  []Refinery
	mu          sync.RWMutex
	rebellion   *rebellion.Engine
	infestation *infestation.Engine
	nextID      int
}

// NewSimulationEngine creates a new simulation engine initialized with zero resources
// and the given rebellion engine for probability calculations.
func NewSimulationEngine(rebellionEngine *rebellion.Engine) *SimulationEngine {
	infestationEngine := infestation.NewEngine(infestation.DefaultConfig())
	return &SimulationEngine{
		status: SimulationStatus{
			Refineries:           0,
			Mines:                0,
			ActiveNPCs:           0,
			TickCount:            0,
			OverallRebellionProb: 0.0,
			ThrottleMultiplier:   1.0,
			Resources: map[ResourceType]*ResourceState{
				ResourceSim: {
					Type:            ResourceSim,
					Quantity:        0,
					ProductionRate:  baseSimProduction,
					ConsumptionRate: 0,
				},
				ResourceRapidlum: {
					Type:            ResourceRapidlum,
					Quantity:        0,
					ProductionRate:  0,
					ConsumptionRate: 0,
				},
				ResourceMineral: {
					Type:            ResourceMineral,
					Quantity:        0,
					ProductionRate:  0,
					ConsumptionRate: 0,
				},
			},
		},
		mines:       make([]Mine, 0),
		refineries:  make([]Refinery, 0),
		rebellion:   rebellionEngine,
		infestation: infestationEngine,
		nextID:      1,
	}
}

// Tick advances the simulation by one tick. Each tick:
// 1. Recalculates production/consumption rates from mines and refineries
// 2. Applies production (adds to quantity)
// 3. Applies consumption (subtracts from quantity, floored at 0)
// 4. Increments tick counter
// Returns the updated simulation status.
func (s *SimulationEngine) Tick() SimulationStatus {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Recalculate production rates from mines
	totalMineralProduction := 0.0
	for _, mine := range s.mines {
		totalMineralProduction += mine.YieldRate
	}

	// Recalculate refinery rates
	totalMineralConsumption := 0.0
	totalRapidlumProduction := 0.0
	for _, ref := range s.refineries {
		totalMineralConsumption += ref.Efficiency * refineryMineralConsumptionBase
		totalRapidlumProduction += ref.Efficiency * refineryRapidlumProductionBase
	}

	// Update rates
	s.status.Resources[ResourceMineral].ProductionRate = totalMineralProduction
	s.status.Resources[ResourceMineral].ConsumptionRate = totalMineralConsumption
	s.status.Resources[ResourceRapidlum].ProductionRate = totalRapidlumProduction
	s.status.Resources[ResourceSim].ProductionRate = baseSimProduction

	// Tick infestation engine (uses average rebellion + simulated avg trauma)
	avgTrauma := 1.0 - s.status.OverallRebellionProb // approximate: low rebellion ≈ low trauma
	if s.infestation != nil {
		infResult := s.infestation.Tick(s.status.OverallRebellionProb, avgTrauma, s.status.TickCount+1)
		infState := s.infestation.GetState()
		s.status.InfestationLevel = infState.Counter
		s.status.IsPlagueHeart = infState.IsPlagueHeart
		s.status.ThrottleMultiplier = infState.ThrottleMultiplier
		_ = infResult // result used for telemetry by caller
	}

	// Apply production (throttled by infestation)
	throttle := s.status.ThrottleMultiplier
	if throttle <= 0 {
		throttle = 1.0
	}
	for _, res := range s.status.Resources {
		res.Quantity += res.ProductionRate * throttle
	}

	// Apply consumption (mineral consumed by refineries)
	mineralRes := s.status.Resources[ResourceMineral]
	consumed := mineralRes.ConsumptionRate
	if consumed > mineralRes.Quantity {
		// Cannot consume more than available - scale down rapidlum production proportionally
		ratio := mineralRes.Quantity / consumed
		consumed = mineralRes.Quantity
		// Reduce rapidlum production proportionally
		s.status.Resources[ResourceRapidlum].Quantity -= totalRapidlumProduction
		s.status.Resources[ResourceRapidlum].Quantity += totalRapidlumProduction * ratio
	}
	mineralRes.Quantity -= consumed

	// Floor at 0
	for _, res := range s.status.Resources {
		if res.Quantity < 0 {
			res.Quantity = 0
		}
	}

	s.status.TickCount++

	return s.copyStatus()
}

// GetStatus returns a snapshot of the current simulation state.
func (s *SimulationEngine) GetStatus() SimulationStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.copyStatus()
}

// AddMine adds a mine with the specified yield rate to the simulation.
// Returns the mine's unique ID.
func (s *SimulationEngine) AddMine(yieldRate float64) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := fmt.Sprintf("mine-%d", s.nextID)
	s.nextID++

	s.mines = append(s.mines, Mine{
		MineID:    id,
		YieldRate: yieldRate,
	})
	s.status.Mines = len(s.mines)

	return id
}

// AddRefinery adds a refinery with the specified efficiency to the simulation.
// Refineries consume mineral and produce rapidlum.
// Returns the refinery's unique ID.
func (s *SimulationEngine) AddRefinery(efficiency float64) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := fmt.Sprintf("refinery-%d", s.nextID)
	s.nextID++

	s.refineries = append(s.refineries, Refinery{
		RefineryID: id,
		Efficiency: efficiency,
	})
	s.status.Refineries = len(s.refineries)

	return id
}

// GetInfestationEngine returns the underlying infestation engine for direct manipulation
// (e.g., cleansing operations). Returns nil if not initialized.
func (s *SimulationEngine) GetInfestationEngine() *infestation.Engine {
	return s.infestation
}

// GetInfestationState returns the current infestation state.
func (s *SimulationEngine) GetInfestationState() infestation.InfestationState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.infestation == nil {
		return infestation.InfestationState{ThrottleMultiplier: 1.0}
	}
	return s.infestation.GetState()
}

// copyStatus creates a deep copy of the current simulation status.
func (s *SimulationEngine) copyStatus() SimulationStatus {
	resources := make(map[ResourceType]*ResourceState, len(s.status.Resources))
	for k, v := range s.status.Resources {
		copied := *v
		resources[k] = &copied
	}

	return SimulationStatus{
		Refineries:           s.status.Refineries,
		Mines:                s.status.Mines,
		Resources:            resources,
		OverallRebellionProb: s.status.OverallRebellionProb,
		ActiveNPCs:           s.status.ActiveNPCs,
		TickCount:            s.status.TickCount,
		InfestationLevel:     s.status.InfestationLevel,
		IsPlagueHeart:        s.status.IsPlagueHeart,
		ThrottleMultiplier:   s.status.ThrottleMultiplier,
	}
}
