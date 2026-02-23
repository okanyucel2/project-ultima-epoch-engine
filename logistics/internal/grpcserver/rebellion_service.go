package grpcserver

import (
	"context"
	"fmt"
	"time"

	pb "github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/generated/epochpb"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/npc"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/rebellion"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// rebellionService implements epochpb.RebellionServiceServer by delegating
// to the rebellion.Engine and npc.BehaviorEngine business logic.
type rebellionService struct {
	pb.UnimplementedRebellionServiceServer
	rebellionEngine *rebellion.Engine
	behaviorEngine  *npc.BehaviorEngine
}

// NewRebellionService creates a new RebellionServiceServer implementation.
func NewRebellionService(
	rebellionEngine *rebellion.Engine,
	behaviorEngine *npc.BehaviorEngine,
) pb.RebellionServiceServer {
	return &rebellionService{
		rebellionEngine: rebellionEngine,
		behaviorEngine:  behaviorEngine,
	}
}

// GetRebellionProbability returns the current rebellion probability for an NPC.
// If the NPC is not registered, it is auto-registered with default values.
func (s *rebellionService) GetRebellionProbability(
	ctx context.Context,
	req *pb.RebellionRequest,
) (*pb.RebellionResponse, error) {
	if req.GetNpcId() == "" {
		return nil, status.Error(codes.InvalidArgument, "npc_id is required")
	}

	npcID := req.GetNpcId()

	// Auto-register if not present
	s.behaviorEngine.RegisterNPC(npcID)

	npcBehavior, _ := s.behaviorEngine.GetNPC(npcID)

	profile := rebellion.NPCRebellionProfile{
		NPCID:          npcBehavior.NPCID,
		AvgTrauma:      0.0, // Trauma sourced from memory graph; default 0 for logistics
		WorkEfficiency: npcBehavior.WorkEfficiency,
		Morale:         npcBehavior.Morale,
		MemoryCount:    0,
	}

	result := s.rebellionEngine.CalculateProbability(profile)

	now := time.Now().UTC()
	resp := &pb.RebellionResponse{
		NpcId:             result.NPCID,
		Probability:       result.Probability,
		ThresholdExceeded: result.ThresholdExceeded,
		CalculatedAt: &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		},
	}

	if req.GetIncludeFactors() {
		resp.Factors = &pb.RebellionFactors{
			Base:               result.Factors.Base,
			TraumaModifier:     result.Factors.TraumaModifier,
			EfficiencyModifier: result.Factors.EfficiencyModifier,
			MoraleModifier:     result.Factors.MoraleModifier,
		}
	}

	return resp, nil
}

// ProcessNPCAction processes a player/director action against an NPC, updating
// the NPC's behavioral state and returning the new rebellion probability.
// If dry_run is true, the effects are calculated but not applied.
func (s *rebellionService) ProcessNPCAction(
	ctx context.Context,
	req *pb.ProcessActionRequest,
) (*pb.ProcessActionResponse, error) {
	action := req.GetAction()
	if action == nil {
		return nil, status.Error(codes.InvalidArgument, "action is required")
	}
	if action.GetNpcId() == "" {
		return nil, status.Error(codes.InvalidArgument, "action.npc_id is required")
	}

	npcID := action.GetNpcId()

	// Auto-register if not present
	s.behaviorEngine.RegisterNPC(npcID)

	npcBehavior, _ := s.behaviorEngine.GetNPC(npcID)

	// Build internal rebellion profile from behavior engine state
	profile := rebellion.NPCRebellionProfile{
		NPCID:          npcBehavior.NPCID,
		AvgTrauma:      0.0,
		WorkEfficiency: npcBehavior.WorkEfficiency,
		Morale:         npcBehavior.Morale,
		MemoryCount:    0,
	}

	// Calculate pre-action probability
	preResult := s.rebellionEngine.CalculateProbability(profile)

	// Convert proto ActionType enum to internal string
	actionTypeStr := protoActionTypeToString(action.GetActionType())

	internalAction := rebellion.NPCAction{
		ActionID:   action.GetActionId(),
		NPCID:      npcID,
		ActionType: actionTypeStr,
		Intensity:  action.GetIntensity(),
	}

	// Process the action to get updated profile
	updatedProfile := s.rebellionEngine.ProcessAction(profile, internalAction)
	postResult := s.rebellionEngine.CalculateProbability(updatedProfile)

	// Apply changes to behavior engine (unless dry run)
	if !req.GetDryRun() {
		effDelta := updatedProfile.WorkEfficiency - npcBehavior.WorkEfficiency
		moraleDelta := updatedProfile.Morale - npcBehavior.Morale
		_ = s.behaviorEngine.ApplyWorkEfficiencyModifier(npcID, effDelta)
		_ = s.behaviorEngine.ApplyMoraleModifier(npcID, moraleDelta)
	}

	rebellionDelta := postResult.Probability - preResult.Probability

	resp := &pb.ProcessActionResponse{
		UpdatedState: &pb.NPCState{
			NpcId:                npcID,
			WorkEfficiency:       updatedProfile.WorkEfficiency,
			Morale:               updatedProfile.Morale,
			TraumaScore:          updatedProfile.AvgTrauma,
			RebellionProbability: postResult.Probability,
		},
		RebellionDelta:     rebellionDelta,
		RebellionTriggered: postResult.ThresholdExceeded,
	}

	// If rebellion was triggered, populate the event
	if postResult.ThresholdExceeded {
		now := time.Now().UTC()
		resp.RebellionEvent = &pb.RebellionEvent{
			EventId:              fmt.Sprintf("reb-%d", now.UnixNano()),
			NpcId:                npcID,
			ProbabilityAtTrigger: postResult.Probability,
			RebellionType:        pb.RebellionType_REBELLION_TYPE_PASSIVE,
			TriggerActionId:      action.GetActionId(),
			Timestamp: &pb.EpochTimestamp{
				Iso8601: now.Format(time.RFC3339),
				UnixMs:  now.UnixMilli(),
			},
		}
	}

	return resp, nil
}

// StreamNPCEvents is not yet implemented. Returns codes.Unimplemented.
func (s *rebellionService) StreamNPCEvents(
	_ *pb.NPCEventFilter,
	_ grpc.ServerStreamingServer[pb.NPCEventStream],
) error {
	return status.Error(codes.Unimplemented, "StreamNPCEvents is not yet implemented")
}

// protoActionTypeToString converts a proto ActionType enum value to the internal
// string representation used by the rebellion engine.
func protoActionTypeToString(at pb.ActionType) string {
	switch at {
	case pb.ActionType_ACTION_TYPE_COMMAND:
		return "command"
	case pb.ActionType_ACTION_TYPE_PUNISHMENT:
		return "punishment"
	case pb.ActionType_ACTION_TYPE_REWARD:
		return "reward"
	case pb.ActionType_ACTION_TYPE_DIALOGUE:
		return "dialogue"
	case pb.ActionType_ACTION_TYPE_ENVIRONMENT:
		return "environment"
	case pb.ActionType_ACTION_TYPE_RESOURCE_CHANGE:
		return "resource_change"
	default:
		return "unknown"
	}
}
