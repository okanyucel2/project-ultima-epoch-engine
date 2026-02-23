package grpcserver

import (
	"context"
	"net"
	"testing"

	pb "github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/generated/epochpb"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/rebellion"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/simulation"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

// setupSimulationTest creates an in-process gRPC server with a SimulationService
// and returns a connected client plus the underlying simulation engine for setup.
func setupSimulationTest(t *testing.T) (pb.SimulationServiceClient, *simulation.SimulationEngine, func()) {
	t.Helper()

	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	simEngine := simulation.NewSimulationEngine(rebEngine)

	lis := bufconn.Listen(bufSize)
	srv := grpc.NewServer()
	pb.RegisterSimulationServiceServer(srv, NewSimulationService(simEngine))

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

	client := pb.NewSimulationServiceClient(conn)
	cleanup := func() {
		conn.Close()
		srv.GracefulStop()
	}

	return client, simEngine, cleanup
}

func TestGetSimulationStatus(t *testing.T) {
	client, _, cleanup := setupSimulationTest(t)
	defer cleanup()

	resp, err := client.GetSimulationStatus(context.Background(), &pb.SimStatusRequest{
		IncludeDetails: true,
	})

	require.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Equal(t, int32(0), resp.GetRefineries())
	assert.Equal(t, int32(0), resp.GetMines())
	assert.Equal(t, int64(0), resp.GetTickCount())
	assert.Equal(t, int32(0), resp.GetActiveNpcs())

	// Should have 3 resource types in the initial status
	assert.Len(t, resp.GetResources(), 3, "should have sim, rapidlum, mineral resources")
	assert.NotNil(t, resp.GetLastTick())
}

func TestGetSimulationStatus_WithMinesAndRefineries(t *testing.T) {
	client, simEngine, cleanup := setupSimulationTest(t)
	defer cleanup()

	// Add infrastructure
	simEngine.AddMine(5.0)
	simEngine.AddRefinery(0.8)

	resp, err := client.GetSimulationStatus(context.Background(), &pb.SimStatusRequest{})

	require.NoError(t, err)
	assert.Equal(t, int32(1), resp.GetMines())
	assert.Equal(t, int32(1), resp.GetRefineries())
}

func TestAdvanceSimulation_OneTick(t *testing.T) {
	client, _, cleanup := setupSimulationTest(t)
	defer cleanup()

	resp, err := client.AdvanceSimulation(context.Background(), &pb.AdvanceRequest{
		Ticks: 1,
	})

	require.NoError(t, err)
	assert.NotNil(t, resp.GetStatus())
	assert.Equal(t, int64(1), resp.GetStatus().GetTickCount())

	// Check Sim resource increased (base production = 1.0)
	for _, res := range resp.GetStatus().GetResources() {
		if res.GetType() == pb.ResourceType_RESOURCE_TYPE_SIM {
			assert.InDelta(t, 1.0, res.GetQuantity(), 0.01, "Sim should have 1.0 after 1 tick")
		}
	}
}

func TestAdvanceSimulation_MultipleTicks(t *testing.T) {
	client, _, cleanup := setupSimulationTest(t)
	defer cleanup()

	resp, err := client.AdvanceSimulation(context.Background(), &pb.AdvanceRequest{
		Ticks: 5,
	})

	require.NoError(t, err)
	assert.Equal(t, int64(5), resp.GetStatus().GetTickCount())

	// Sim resource should have accumulated: 5 * 1.0 = 5.0
	for _, res := range resp.GetStatus().GetResources() {
		if res.GetType() == pb.ResourceType_RESOURCE_TYPE_SIM {
			assert.InDelta(t, 5.0, res.GetQuantity(), 0.01, "Sim should have 5.0 after 5 ticks")
		}
	}
}

func TestAdvanceSimulation_DefaultsToOneTick(t *testing.T) {
	client, _, cleanup := setupSimulationTest(t)
	defer cleanup()

	// Zero ticks should default to 1
	resp, err := client.AdvanceSimulation(context.Background(), &pb.AdvanceRequest{
		Ticks: 0,
	})

	require.NoError(t, err)
	assert.Equal(t, int64(1), resp.GetStatus().GetTickCount())
}

func TestAdvanceSimulation_WithMineProduction(t *testing.T) {
	client, simEngine, cleanup := setupSimulationTest(t)
	defer cleanup()

	simEngine.AddMine(10.0) // 10 mineral per tick

	resp, err := client.AdvanceSimulation(context.Background(), &pb.AdvanceRequest{
		Ticks: 3,
	})

	require.NoError(t, err)
	assert.Equal(t, int64(3), resp.GetStatus().GetTickCount())

	for _, res := range resp.GetStatus().GetResources() {
		if res.GetType() == pb.ResourceType_RESOURCE_TYPE_MINERAL {
			assert.InDelta(t, 30.0, res.GetQuantity(), 0.01, "Mineral should be 3*10=30 after 3 ticks")
		}
	}
}

func TestUpdateResourceAllocation_Unimplemented(t *testing.T) {
	client, _, cleanup := setupSimulationTest(t)
	defer cleanup()

	_, err := client.UpdateResourceAllocation(context.Background(), &pb.ResourceAllocationRequest{
		TargetId:     "refinery-1",
		NpcCount:     5,
		ResourceType: pb.ResourceType_RESOURCE_TYPE_MINERAL,
	})

	require.Error(t, err)
	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.Unimplemented, st.Code())
}
