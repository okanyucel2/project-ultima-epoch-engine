package grpcserver

import (
	"context"
	"time"

	pb "github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/generated/epochpb"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/simulation"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// simulationService implements epochpb.SimulationServiceServer by delegating
// to the simulation.SimulationEngine business logic.
type simulationService struct {
	pb.UnimplementedSimulationServiceServer
	simEngine *simulation.SimulationEngine
}

// NewSimulationService creates a new SimulationServiceServer implementation.
func NewSimulationService(simEngine *simulation.SimulationEngine) pb.SimulationServiceServer {
	return &simulationService{
		simEngine: simEngine,
	}
}

// GetSimulationStatus returns the current state of the simulation engine.
func (s *simulationService) GetSimulationStatus(
	ctx context.Context,
	req *pb.SimStatusRequest,
) (*pb.SimulationStatus, error) {
	internalStatus := s.simEngine.GetStatus()
	return convertSimulationStatus(internalStatus), nil
}

// AdvanceSimulation advances the simulation by the requested number of ticks.
// If ticks is zero or negative, defaults to 1.
func (s *simulationService) AdvanceSimulation(
	ctx context.Context,
	req *pb.AdvanceRequest,
) (*pb.AdvanceResponse, error) {
	ticks := int(req.GetTicks())
	if ticks <= 0 {
		ticks = 1
	}

	var lastStatus simulation.SimulationStatus
	for i := 0; i < ticks; i++ {
		lastStatus = s.simEngine.Tick()
	}

	return &pb.AdvanceResponse{
		Status: convertSimulationStatus(lastStatus),
		Events: nil, // Events will be populated when StreamNPCEvents is implemented
	}, nil
}

// UpdateResourceAllocation is not yet implemented. Returns codes.Unimplemented.
func (s *simulationService) UpdateResourceAllocation(
	ctx context.Context,
	req *pb.ResourceAllocationRequest,
) (*pb.ResourceAllocationResponse, error) {
	return nil, status.Error(codes.Unimplemented, "UpdateResourceAllocation is not yet implemented")
}

// convertSimulationStatus transforms internal simulation.SimulationStatus into
// the protobuf SimulationStatus message.
func convertSimulationStatus(s simulation.SimulationStatus) *pb.SimulationStatus {
	now := time.Now().UTC()

	resources := make([]*pb.ResourceState, 0, len(s.Resources))
	for rType, rState := range s.Resources {
		resources = append(resources, &pb.ResourceState{
			Type:            internalResourceTypeToProto(rType),
			Quantity:        rState.Quantity,
			ProductionRate:  rState.ProductionRate,
			ConsumptionRate: rState.ConsumptionRate,
		})
	}

	return &pb.SimulationStatus{
		Refineries:                  int32(s.Refineries),
		Mines:                       int32(s.Mines),
		Resources:                   resources,
		OverallRebellionProbability: s.OverallRebellionProb,
		ActiveNpcs:                  int32(s.ActiveNPCs),
		TickCount:                   s.TickCount,
		LastTick: &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		},
	}
}

// internalResourceTypeToProto maps internal ResourceType strings to proto enum values.
func internalResourceTypeToProto(rt simulation.ResourceType) pb.ResourceType {
	switch rt {
	case simulation.ResourceSim:
		return pb.ResourceType_RESOURCE_TYPE_SIM
	case simulation.ResourceRapidlum:
		return pb.ResourceType_RESOURCE_TYPE_RAPIDLUM
	case simulation.ResourceMineral:
		return pb.ResourceType_RESOURCE_TYPE_MINERAL
	default:
		return pb.ResourceType_RESOURCE_TYPE_UNSPECIFIED
	}
}
