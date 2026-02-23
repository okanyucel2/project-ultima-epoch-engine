package simulation

// ResourceType represents the type of resource in the Epoch Engine economy.
type ResourceType string

const (
	ResourceSim      ResourceType = "sim"
	ResourceRapidlum ResourceType = "rapidlum"
	ResourceMineral  ResourceType = "mineral"
)

// ResourceState tracks the current state of a single resource type.
type ResourceState struct {
	Type            ResourceType
	Quantity        float64 // Current available quantity
	ProductionRate  float64 // Units produced per tick
	ConsumptionRate float64 // Units consumed per tick
}

// SimulationStatus represents the full state of the simulation at a point in time.
type SimulationStatus struct {
	Refineries           int
	Mines                int
	Resources            map[ResourceType]*ResourceState
	OverallRebellionProb float64
	ActiveNPCs           int
	TickCount            int64
}

// Mine represents a mineral extraction facility.
type Mine struct {
	MineID    string
	YieldRate float64 // Mineral produced per tick
}

// Refinery represents a mineral-to-rapidlum conversion facility.
type Refinery struct {
	RefineryID string
	Efficiency float64 // 0.0-1.0: conversion efficiency
}
