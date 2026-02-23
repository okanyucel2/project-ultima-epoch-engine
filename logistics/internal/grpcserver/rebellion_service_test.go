package grpcserver

import (
	"context"
	"net"
	"testing"

	pb "github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/generated/epochpb"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/npc"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/rebellion"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

const bufSize = 1024 * 1024

// setupRebellionTest creates an in-process gRPC server with a RebellionService
// and returns a connected client. The cleanup function stops the server.
func setupRebellionTest(t *testing.T) (pb.RebellionServiceClient, func()) {
	t.Helper()

	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	behaviorEngine := npc.NewBehaviorEngine()

	lis := bufconn.Listen(bufSize)
	srv := grpc.NewServer()
	pb.RegisterRebellionServiceServer(srv, NewRebellionService(rebEngine, behaviorEngine))

	go func() {
		if err := srv.Serve(lis); err != nil {
			t.Logf("server exited: %v", err)
		}
	}()

	conn, err := grpc.NewClient(
		"passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)

	client := pb.NewRebellionServiceClient(conn)
	cleanup := func() {
		conn.Close()
		srv.GracefulStop()
	}

	return client, cleanup
}

func TestGetRebellionProbability_Default(t *testing.T) {
	client, cleanup := setupRebellionTest(t)
	defer cleanup()

	resp, err := client.GetRebellionProbability(context.Background(), &pb.RebellionRequest{
		NpcId:          "npc-001",
		IncludeFactors: false,
	})

	require.NoError(t, err)
	assert.Equal(t, "npc-001", resp.GetNpcId())

	// Default NPC: efficiency=0.5, morale=0.5, trauma=0.0
	// probability = 0.05 + 0*0.3 + (1-0.5)*0.3 + (1-0.5)*0.2 = 0.05 + 0.15 + 0.10 = 0.30
	assert.InDelta(t, 0.30, resp.GetProbability(), 0.01, "default NPC should have ~0.30 rebellion probability")
	assert.False(t, resp.GetThresholdExceeded(), "0.30 should not exceed default threshold of 0.35")
	assert.Nil(t, resp.GetFactors(), "factors should be nil when include_factors is false")
	assert.NotNil(t, resp.GetCalculatedAt(), "calculated_at should be set")
}

func TestGetRebellionProbability_WithFactors(t *testing.T) {
	client, cleanup := setupRebellionTest(t)
	defer cleanup()

	resp, err := client.GetRebellionProbability(context.Background(), &pb.RebellionRequest{
		NpcId:          "npc-002",
		IncludeFactors: true,
	})

	require.NoError(t, err)
	assert.Equal(t, "npc-002", resp.GetNpcId())

	factors := resp.GetFactors()
	require.NotNil(t, factors, "factors should be present when include_factors is true")

	assert.InDelta(t, 0.05, factors.GetBase(), 0.001, "base should be 0.05")
	assert.InDelta(t, 0.0, factors.GetTraumaModifier(), 0.001, "trauma modifier should be 0.0 for default NPC")
	assert.InDelta(t, 0.15, factors.GetEfficiencyModifier(), 0.001, "efficiency modifier should be (1-0.5)*0.3 = 0.15")
	assert.InDelta(t, 0.10, factors.GetMoraleModifier(), 0.001, "morale modifier should be (1-0.5)*0.2 = 0.10")
}

func TestGetRebellionProbability_InvalidArgument(t *testing.T) {
	client, cleanup := setupRebellionTest(t)
	defer cleanup()

	_, err := client.GetRebellionProbability(context.Background(), &pb.RebellionRequest{
		NpcId: "",
	})

	require.Error(t, err)
	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.InvalidArgument, st.Code())
}

func TestProcessNPCAction_Reward(t *testing.T) {
	client, cleanup := setupRebellionTest(t)
	defer cleanup()

	// First, get baseline probability
	baseResp, err := client.GetRebellionProbability(context.Background(), &pb.RebellionRequest{
		NpcId: "npc-reward",
	})
	require.NoError(t, err)
	baseProbability := baseResp.GetProbability()

	// Apply a reward action
	resp, err := client.ProcessNPCAction(context.Background(), &pb.ProcessActionRequest{
		Action: &pb.NPCAction{
			ActionId:   "act-reward-001",
			NpcId:      "npc-reward",
			ActionType: pb.ActionType_ACTION_TYPE_REWARD,
			Intensity:  0.8,
		},
		DryRun: false,
	})

	require.NoError(t, err)
	assert.NotNil(t, resp.GetUpdatedState())
	assert.Equal(t, "npc-reward", resp.GetUpdatedState().GetNpcId())

	// Reward increases morale: morale += 0.8 * 0.15 = 0.12 → 0.5 + 0.12 = 0.62
	assert.InDelta(t, 0.62, resp.GetUpdatedState().GetMorale(), 0.01, "morale should increase after reward")

	// Rebellion should decrease (negative delta)
	assert.Less(t, resp.GetRebellionDelta(), 0.0, "rebellion delta should be negative after reward")
	assert.Less(t, resp.GetUpdatedState().GetRebellionProbability(), baseProbability,
		"post-reward rebellion should be lower than baseline")
}

func TestProcessNPCAction_Punishment(t *testing.T) {
	client, cleanup := setupRebellionTest(t)
	defer cleanup()

	// Get baseline
	baseResp, err := client.GetRebellionProbability(context.Background(), &pb.RebellionRequest{
		NpcId: "npc-punish",
	})
	require.NoError(t, err)
	baseProbability := baseResp.GetProbability()

	// Apply punishment
	resp, err := client.ProcessNPCAction(context.Background(), &pb.ProcessActionRequest{
		Action: &pb.NPCAction{
			ActionId:   "act-punish-001",
			NpcId:      "npc-punish",
			ActionType: pb.ActionType_ACTION_TYPE_PUNISHMENT,
			Intensity:  0.8,
		},
		DryRun: false,
	})

	require.NoError(t, err)

	// Punishment: morale -= 0.8 * 0.20 = 0.16 → 0.5 - 0.16 = 0.34
	// Punishment: trauma += 0.8 * 0.15 = 0.12 → 0.0 + 0.12 = 0.12
	assert.InDelta(t, 0.34, resp.GetUpdatedState().GetMorale(), 0.01, "morale should decrease after punishment")
	assert.InDelta(t, 0.12, resp.GetUpdatedState().GetTraumaScore(), 0.01, "trauma should increase after punishment")

	// Rebellion probability should increase
	assert.Greater(t, resp.GetRebellionDelta(), 0.0, "rebellion delta should be positive after punishment")
	assert.Greater(t, resp.GetUpdatedState().GetRebellionProbability(), baseProbability,
		"post-punishment rebellion should be higher than baseline")
}

func TestProcessNPCAction_DryRun(t *testing.T) {
	client, cleanup := setupRebellionTest(t)
	defer cleanup()

	// Register NPC and get initial state
	_, err := client.GetRebellionProbability(context.Background(), &pb.RebellionRequest{
		NpcId: "npc-dryrun",
	})
	require.NoError(t, err)

	// Do a dry run punishment
	dryResp, err := client.ProcessNPCAction(context.Background(), &pb.ProcessActionRequest{
		Action: &pb.NPCAction{
			ActionId:   "act-dry-001",
			NpcId:      "npc-dryrun",
			ActionType: pb.ActionType_ACTION_TYPE_PUNISHMENT,
			Intensity:  1.0,
		},
		DryRun: true,
	})
	require.NoError(t, err)

	// The response should show what WOULD happen
	assert.Less(t, dryResp.GetUpdatedState().GetMorale(), 0.5,
		"dry run response should show decreased morale")

	// But actual state should remain unchanged
	afterResp, err := client.GetRebellionProbability(context.Background(), &pb.RebellionRequest{
		NpcId:          "npc-dryrun",
		IncludeFactors: true,
	})
	require.NoError(t, err)
	// Morale modifier should still be (1-0.5)*0.2 = 0.10 (unchanged from default)
	assert.InDelta(t, 0.10, afterResp.GetFactors().GetMoraleModifier(), 0.001,
		"state should not change after dry run")
}

func TestStreamNPCEvents_Unimplemented(t *testing.T) {
	client, cleanup := setupRebellionTest(t)
	defer cleanup()

	stream, err := client.StreamNPCEvents(context.Background(), &pb.NPCEventFilter{
		NpcIds: []string{"npc-001"},
	})
	if err != nil {
		// Some gRPC versions return error immediately
		st, ok := status.FromError(err)
		require.True(t, ok)
		assert.Equal(t, codes.Unimplemented, st.Code())
		return
	}

	// Others return error on first Recv
	_, err = stream.Recv()
	require.Error(t, err)
	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.Unimplemented, st.Code())
}

func TestProcessNPCAction_InvalidArgument_NilAction(t *testing.T) {
	client, cleanup := setupRebellionTest(t)
	defer cleanup()

	_, err := client.ProcessNPCAction(context.Background(), &pb.ProcessActionRequest{
		Action: nil,
	})

	require.Error(t, err)
	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.InvalidArgument, st.Code())
}

func TestProcessNPCAction_InvalidArgument_EmptyNpcId(t *testing.T) {
	client, cleanup := setupRebellionTest(t)
	defer cleanup()

	_, err := client.ProcessNPCAction(context.Background(), &pb.ProcessActionRequest{
		Action: &pb.NPCAction{
			ActionId:   "act-001",
			NpcId:      "",
			ActionType: pb.ActionType_ACTION_TYPE_REWARD,
			Intensity:  0.5,
		},
	})

	require.Error(t, err)
	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.InvalidArgument, st.Code())
}
