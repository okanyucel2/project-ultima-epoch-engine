package economy

import "sync"

// ResourceType represents the type of resource in the Epoch Engine economy.
// Mirrors the simulation ResourceType for economy-layer pricing.
type ResourceType string

const (
	ResourceSim      ResourceType = "sim"
	ResourceRapidlum ResourceType = "rapidlum"
	ResourceMineral  ResourceType = "mineral"
)

// ResourcePrice defines the buy and sell prices for a resource type.
type ResourcePrice struct {
	Type      ResourceType
	BuyPrice  float64 // Cost to acquire from market
	SellPrice float64 // Revenue from selling to market
}

// EconomyEngine manages resource pricing and trade calculations.
// It is safe for concurrent use.
type EconomyEngine struct {
	prices map[ResourceType]*ResourcePrice
	mu     sync.RWMutex
}

// NewEconomyEngine creates a new EconomyEngine with default market prices.
//
// Default prices:
//   - Sim:      Buy=1.0, Sell=0.8
//   - Rapidlum: Buy=5.0, Sell=4.0
//   - Mineral:  Buy=0.5, Sell=0.3
func NewEconomyEngine() *EconomyEngine {
	return &EconomyEngine{
		prices: map[ResourceType]*ResourcePrice{
			ResourceSim: {
				Type:      ResourceSim,
				BuyPrice:  1.0,
				SellPrice: 0.8,
			},
			ResourceRapidlum: {
				Type:      ResourceRapidlum,
				BuyPrice:  5.0,
				SellPrice: 4.0,
			},
			ResourceMineral: {
				Type:      ResourceMineral,
				BuyPrice:  0.5,
				SellPrice: 0.3,
			},
		},
	}
}

// GetPrice returns the current price for the specified resource type.
// Returns nil and false if the resource type is not recognized.
func (e *EconomyEngine) GetPrice(resourceType ResourceType) (*ResourcePrice, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	price, ok := e.prices[resourceType]
	if !ok {
		return nil, false
	}
	return price, true
}

// CalculateTradeValue calculates the value of selling a given quantity of a resource.
// Returns 0.0 if the resource type is unknown.
func (e *EconomyEngine) CalculateTradeValue(resourceType ResourceType, quantity float64) float64 {
	e.mu.RLock()
	defer e.mu.RUnlock()

	price, ok := e.prices[resourceType]
	if !ok {
		return 0.0
	}
	return quantity * price.SellPrice
}
