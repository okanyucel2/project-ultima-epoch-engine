package grpcserver

import (
	"context"
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/npc"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/rebellion"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/simulation"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// getFreePort asks the OS for an available TCP port.
func getFreePort(t *testing.T) string {
	t.Helper()
	lis, err := net.Listen("tcp", ":0")
	require.NoError(t, err)
	port := lis.Addr().(*net.TCPAddr).Port
	lis.Close()
	return fmt.Sprintf("%d", port)
}

func TestServerStartsAndStops(t *testing.T) {
	port := getFreePort(t)

	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	simEngine := simulation.NewSimulationEngine(rebEngine)
	behaviorEngine := npc.NewBehaviorEngine()

	srv := NewEpochGRPCServer(port, rebEngine, simEngine, behaviorEngine)
	assert.Equal(t, port, srv.Port())

	// Start the server in a goroutine
	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.Start()
	}()

	// Give the server a moment to start
	time.Sleep(100 * time.Millisecond)

	// Verify it is listening by connecting
	conn, err := grpc.NewClient(
		fmt.Sprintf("localhost:%s", port),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer conn.Close()

	// Verify the server address is populated
	assert.NotEmpty(t, srv.Addr(), "Addr() should return the listener address after start")

	// Stop the server
	srv.Stop()

	// Server should have exited from Start()
	select {
	case err := <-errCh:
		// grpc.Server.Serve returns nil after GracefulStop
		assert.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("server did not stop within 5 seconds")
	}
}

func TestServerRegistersServices(t *testing.T) {
	port := getFreePort(t)

	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	simEngine := simulation.NewSimulationEngine(rebEngine)
	behaviorEngine := npc.NewBehaviorEngine()

	srv := NewEpochGRPCServer(port, rebEngine, simEngine, behaviorEngine)

	go func() {
		_ = srv.Start()
	}()
	defer srv.Stop()

	// Wait for server to be ready
	time.Sleep(100 * time.Millisecond)

	conn, err := grpc.NewClient(
		fmt.Sprintf("localhost:%s", port),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer conn.Close()

	// Use the health check client to verify services are registered
	healthClient := healthpb.NewHealthClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Check overall health
	resp, err := healthClient.Check(ctx, &healthpb.HealthCheckRequest{
		Service: "",
	})
	require.NoError(t, err)
	assert.Equal(t, healthpb.HealthCheckResponse_SERVING, resp.GetStatus())

	// Check RebellionService health
	resp, err = healthClient.Check(ctx, &healthpb.HealthCheckRequest{
		Service: "epoch.RebellionService",
	})
	require.NoError(t, err)
	assert.Equal(t, healthpb.HealthCheckResponse_SERVING, resp.GetStatus())

	// Check SimulationService health
	resp, err = healthClient.Check(ctx, &healthpb.HealthCheckRequest{
		Service: "epoch.SimulationService",
	})
	require.NoError(t, err)
	assert.Equal(t, healthpb.HealthCheckResponse_SERVING, resp.GetStatus())
}

func TestServerDefaultPort(t *testing.T) {
	rebEngine := rebellion.NewEngine(rebellion.DefaultConfig())
	simEngine := simulation.NewSimulationEngine(rebEngine)
	behaviorEngine := npc.NewBehaviorEngine()

	srv := NewEpochGRPCServer("", rebEngine, simEngine, behaviorEngine)
	assert.Equal(t, DefaultGRPCPort, srv.Port(), "empty port should default to DefaultGRPCPort")
}
