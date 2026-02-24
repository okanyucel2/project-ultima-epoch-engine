package grpcserver

import (
	"fmt"
	"log"
	"net"

	pb "github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/generated/epochpb"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/npc"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/rebellion"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/simulation"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

// DefaultGRPCPort is the default port for the gRPC server.
const DefaultGRPCPort = "12066"

// EpochGRPCServer wraps a gRPC server that hosts the RebellionService,
// SimulationService, and TelemetryService for the Epoch Engine logistics backend.
type EpochGRPCServer struct {
	port             string
	grpcServer       *grpc.Server
	rebellionEngine  *rebellion.Engine
	simulationEngine *simulation.SimulationEngine
	behaviorEngine   *npc.BehaviorEngine
	listener         net.Listener
	TelemetrySvc     *telemetryService // Exported for direct event emission
}

// NewEpochGRPCServer creates a new gRPC server configured with the given engines.
// The port should be a plain port string (e.g. "12066"), without the colon prefix.
func NewEpochGRPCServer(
	port string,
	rebellionEngine *rebellion.Engine,
	simulationEngine *simulation.SimulationEngine,
	behaviorEngine *npc.BehaviorEngine,
) *EpochGRPCServer {
	if port == "" {
		port = DefaultGRPCPort
	}
	telSvc := NewTelemetryService(rebellionEngine, behaviorEngine)
	return &EpochGRPCServer{
		port:             port,
		rebellionEngine:  rebellionEngine,
		simulationEngine: simulationEngine,
		behaviorEngine:   behaviorEngine,
		TelemetrySvc:     telSvc,
	}
}

// Start creates a TCP listener, registers all gRPC services, and begins
// serving requests. This method blocks until the server is stopped or an
// error occurs. It should typically be called in a goroutine.
func (s *EpochGRPCServer) Start() error {
	addr := fmt.Sprintf(":%s", s.port)
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}
	s.listener = lis

	s.grpcServer = grpc.NewServer()

	// Register Rebellion service
	rebellionSvc := NewRebellionService(s.rebellionEngine, s.behaviorEngine)
	pb.RegisterRebellionServiceServer(s.grpcServer, rebellionSvc)

	// Register Simulation service
	simulationSvc := NewSimulationService(s.simulationEngine)
	pb.RegisterSimulationServiceServer(s.grpcServer, simulationSvc)

	// Register Telemetry service (0ms event stream)
	pb.RegisterTelemetryServiceServer(s.grpcServer, s.TelemetrySvc)

	// Register gRPC health check service
	healthServer := health.NewServer()
	healthServer.SetServingStatus("epoch.RebellionService", healthpb.HealthCheckResponse_SERVING)
	healthServer.SetServingStatus("epoch.SimulationService", healthpb.HealthCheckResponse_SERVING)
	healthServer.SetServingStatus("epoch.TelemetryService", healthpb.HealthCheckResponse_SERVING)
	healthServer.SetServingStatus("", healthpb.HealthCheckResponse_SERVING) // overall
	healthpb.RegisterHealthServer(s.grpcServer, healthServer)

	// Register reflection for development tooling (grpcurl, etc.)
	reflection.Register(s.grpcServer)

	log.Printf("[gRPC] Epoch Engine logistics gRPC server listening on %s", addr)
	return s.grpcServer.Serve(lis)
}

// Stop performs a graceful shutdown of the gRPC server, waiting for in-flight
// RPCs to complete before closing the listener.
func (s *EpochGRPCServer) Stop() {
	if s.grpcServer != nil {
		log.Println("[gRPC] Shutting down gracefully...")
		s.grpcServer.GracefulStop()
		log.Println("[gRPC] Server stopped")
	}
}

// Port returns the port the server is configured to listen on.
func (s *EpochGRPCServer) Port() string {
	return s.port
}

// Addr returns the actual listener address after Start() has been called.
// Returns an empty string if the server has not started yet.
func (s *EpochGRPCServer) Addr() string {
	if s.listener != nil {
		return s.listener.Addr().String()
	}
	return ""
}
