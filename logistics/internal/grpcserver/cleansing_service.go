package grpcserver

import (
	"context"

	pb "github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/generated/epochpb"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/cleansing"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/npc"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/simulation"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// cleansingService implements epochpb.CleansingServiceServer.
// It coordinates Sheriff Protocol cleansing operations against active Plague Hearts.
type cleansingService struct {
	pb.UnimplementedCleansingServiceServer
	simulationEngine *simulation.SimulationEngine
	behaviorEngine   *npc.BehaviorEngine
	cleansingEngine  *cleansing.Engine
	telemetrySvc     *telemetryService
}

// NewCleansingService creates a new CleansingServiceServer implementation.
func NewCleansingService(
	simulationEngine *simulation.SimulationEngine,
	behaviorEngine *npc.BehaviorEngine,
	cleansingEngine *cleansing.Engine,
	telemetrySvc *telemetryService,
) *cleansingService {
	return &cleansingService{
		simulationEngine: simulationEngine,
		behaviorEngine:   behaviorEngine,
		cleansingEngine:  cleansingEngine,
		telemetrySvc:     telemetrySvc,
	}
}

// DeployCleansingOperation executes a Sheriff Protocol cleansing operation.
func (s *cleansingService) DeployCleansingOperation(
	ctx context.Context,
	req *pb.CleansingRequest,
) (*pb.CleansingResponse, error) {
	// Check plague heart is active
	infState := s.simulationEngine.GetInfestationState()
	if !infState.IsPlagueHeart {
		return &pb.CleansingResponse{
			Success:      false,
			ErrorMessage: "Plague Heart is not active",
		}, status.Error(codes.FailedPrecondition, "Plague Heart is not active")
	}

	// Gather warriors and guards
	warriors := s.behaviorEngine.GetNPCsByRole("warrior")
	guards := s.behaviorEngine.GetNPCsByRole("guard")

	participants := make([]cleansing.CleansingParticipant, 0, len(warriors)+len(guards))
	for _, w := range warriors {
		participants = append(participants, cleansing.CleansingParticipant{
			NPCID:      w.NPCID,
			Role:       w.Role,
			AvgTrauma:  1.0 - w.Morale, // Approximate: low morale ≈ high trauma
			Morale:     w.Morale,
			Confidence: w.Morale, // Approximate: morale as confidence proxy
		})
	}
	for _, g := range guards {
		participants = append(participants, cleansing.CleansingParticipant{
			NPCID:      g.NPCID,
			Role:       g.Role,
			AvgTrauma:  1.0 - g.Morale,
			Morale:     g.Morale,
			Confidence: g.Morale,
		})
	}

	// Execute cleansing
	result, err := s.cleansingEngine.Execute(participants, true)
	if err != nil {
		return &pb.CleansingResponse{
			Success:      false,
			ErrorMessage: err.Error(),
		}, status.Error(codes.FailedPrecondition, err.Error())
	}

	// On success: cleanse the infestation
	if result.Success {
		if infEngine := s.simulationEngine.GetInfestationEngine(); infEngine != nil {
			_ = infEngine.Cleanse()
		}
		s.telemetrySvc.EmitCleansingResult(true, result.Participants, result.SuccessRate)
	} else {
		s.telemetrySvc.EmitCleansingResult(false, result.Participants, result.SuccessRate)
	}

	return &pb.CleansingResponse{
		Success:          result.Success,
		SuccessRate:      result.SuccessRate,
		ParticipantCount: int32(result.ParticipantCount),
		ParticipantIds:   result.Participants,
		RolledValue:      result.RolledValue,
		Factors: &pb.CleansingFactors{
			Base:                   result.Factors.BaseFactor,
			AvgMorale:             result.Factors.AvgMorale,
			MoraleContribution:    result.Factors.MoraleContrib,
			AvgTrauma:             result.Factors.AvgTrauma,
			TraumaPenalty:         result.Factors.TraumaPenalty,
			AvgConfidence:         result.Factors.AvgConfidence,
			ConfidenceContribution: result.Factors.ConfidenceContrib,
		},
	}, nil
}
