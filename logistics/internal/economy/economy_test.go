package economy

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewEconomyEngine(t *testing.T) {
	engine := NewEconomyEngine()

	// Verify default prices exist
	simPrice, ok := engine.GetPrice(ResourceSim)
	assert.True(t, ok, "Sim price should exist")
	assert.InDelta(t, 1.0, simPrice.BuyPrice, 0.001)
	assert.InDelta(t, 0.8, simPrice.SellPrice, 0.001)

	rapidlumPrice, ok := engine.GetPrice(ResourceRapidlum)
	assert.True(t, ok, "Rapidlum price should exist")
	assert.InDelta(t, 5.0, rapidlumPrice.BuyPrice, 0.001)
	assert.InDelta(t, 4.0, rapidlumPrice.SellPrice, 0.001)

	mineralPrice, ok := engine.GetPrice(ResourceMineral)
	assert.True(t, ok, "Mineral price should exist")
	assert.InDelta(t, 0.5, mineralPrice.BuyPrice, 0.001)
	assert.InDelta(t, 0.3, mineralPrice.SellPrice, 0.001)
}

func TestGetPrice_Unknown(t *testing.T) {
	engine := NewEconomyEngine()

	price, ok := engine.GetPrice(ResourceType("unknown"))
	assert.False(t, ok, "Unknown resource should return false")
	assert.Nil(t, price, "Unknown resource should return nil")
}

func TestCalculateTradeValue(t *testing.T) {
	engine := NewEconomyEngine()

	// Selling 10 minerals at 0.3 sell price
	value := engine.CalculateTradeValue(ResourceMineral, 10.0)
	assert.InDelta(t, 3.0, value, 0.001, "10 minerals * 0.3 sell price = 3.0")

	// Selling 5 rapidlum at 4.0 sell price
	value = engine.CalculateTradeValue(ResourceRapidlum, 5.0)
	assert.InDelta(t, 20.0, value, 0.001, "5 rapidlum * 4.0 sell price = 20.0")

	// Selling 100 sim at 0.8 sell price
	value = engine.CalculateTradeValue(ResourceSim, 100.0)
	assert.InDelta(t, 80.0, value, 0.001, "100 sim * 0.8 sell price = 80.0")
}

func TestCalculateTradeValue_UnknownResource(t *testing.T) {
	engine := NewEconomyEngine()

	value := engine.CalculateTradeValue(ResourceType("unobtainium"), 100.0)
	assert.InDelta(t, 0.0, value, 0.001, "Unknown resource should return 0 value")
}

func TestCalculateTradeValue_ZeroQuantity(t *testing.T) {
	engine := NewEconomyEngine()

	value := engine.CalculateTradeValue(ResourceSim, 0.0)
	assert.InDelta(t, 0.0, value, 0.001, "Zero quantity should return 0 value")
}

func TestCalculateTradeValue_NegativeQuantity(t *testing.T) {
	engine := NewEconomyEngine()

	// Negative quantity represents buying (should still calculate)
	value := engine.CalculateTradeValue(ResourceSim, -10.0)
	assert.InDelta(t, -8.0, value, 0.001, "Negative quantity * sell price = negative value")
}
