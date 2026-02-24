package grpcserver

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	pb "github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/generated/epochpb"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/npc"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/rebellion"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	// maxRecentEvents is the ring buffer capacity for recent telemetry events.
	maxRecentEvents = 500
)

// telemetryService implements epochpb.TelemetryServiceServer.
// It maintains a ring buffer of recent telemetry events and supports
// server-side streaming for real-time 0ms event delivery.
type telemetryService struct {
	pb.UnimplementedTelemetryServiceServer

	rebellionEngine *rebellion.Engine
	behaviorEngine  *npc.BehaviorEngine

	// Ring buffer for recent events
	mu           sync.RWMutex
	recentEvents []*pb.TelemetryEvent
	eventIndex   int
	totalEmitted int64

	// Active stream subscribers
	subscribers   map[int64]chan *pb.TelemetryEvent
	subscriberMu  sync.RWMutex
	nextSubID     int64
}

// NewTelemetryService creates a new TelemetryServiceServer implementation.
func NewTelemetryService(
	rebellionEngine *rebellion.Engine,
	behaviorEngine *npc.BehaviorEngine,
) *telemetryService {
	return &telemetryService{
		rebellionEngine: rebellionEngine,
		behaviorEngine:  behaviorEngine,
		recentEvents:    make([]*pb.TelemetryEvent, 0, maxRecentEvents),
		subscribers:     make(map[int64]chan *pb.TelemetryEvent),
	}
}

// StreamTelemetry implements server-side streaming for real-time telemetry.
// The client sends a filter, and the server pushes matching events as they occur.
func (s *telemetryService) StreamTelemetry(
	filter *pb.TelemetryFilter,
	stream grpc.ServerStreamingServer[pb.TelemetryEvent],
) error {
	// Register subscriber
	subID, ch := s.addSubscriber()
	defer s.removeSubscriber(subID)

	log.Printf("[Telemetry] Stream subscriber %d connected (filter: severity >= %v)", subID, filter.GetMinSeverity())

	for {
		select {
		case event, ok := <-ch:
			if !ok {
				return nil
			}
			// Apply filter
			if !matchesFilter(event, filter) {
				continue
			}
			if err := stream.Send(event); err != nil {
				return err
			}
		case <-stream.Context().Done():
			log.Printf("[Telemetry] Stream subscriber %d disconnected", subID)
			return stream.Context().Err()
		}
	}
}

// GetRecentTelemetry returns recent telemetry events from the ring buffer.
func (s *telemetryService) GetRecentTelemetry(
	ctx context.Context,
	req *pb.RecentTelemetryRequest,
) (*pb.TelemetryBatch, error) {
	limit := int(req.GetLimit())
	if limit <= 0 {
		limit = 50
	}
	if limit > maxRecentEvents {
		limit = maxRecentEvents
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	events := make([]*pb.TelemetryEvent, 0, limit)
	for i := len(s.recentEvents) - 1; i >= 0 && len(events) < limit; i-- {
		ev := s.recentEvents[i]

		// Apply NPC filter
		if req.GetNpcId() != "" && ev.GetNpcId() != req.GetNpcId() {
			continue
		}

		// Apply severity filter
		if req.GetMinSeverity() != pb.TelemetrySeverity_TELEMETRY_SEVERITY_UNSPECIFIED &&
			ev.GetSeverity() < req.GetMinSeverity() {
			continue
		}

		events = append(events, ev)
	}

	now := time.Now().UTC()
	return &pb.TelemetryBatch{
		Events:     events,
		TickNumber: 0,
		BatchTimestamp: &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		},
	}, nil
}

// ReportTelemetryEvent accepts and stores a telemetry event, then broadcasts
// it to all active stream subscribers.
func (s *telemetryService) ReportTelemetryEvent(
	ctx context.Context,
	event *pb.TelemetryEvent,
) (*pb.TelemetryAck, error) {
	if event.GetEventId() == "" {
		return nil, status.Error(codes.InvalidArgument, "event_id is required")
	}
	if event.GetNpcId() == "" {
		return nil, status.Error(codes.InvalidArgument, "npc_id is required")
	}

	// Ensure timestamp
	if event.Timestamp == nil {
		now := time.Now().UTC()
		event.Timestamp = &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		}
	}

	// Store in ring buffer
	s.storeEvent(event)

	// Broadcast to all stream subscribers (non-blocking)
	s.broadcastEvent(event)

	return &pb.TelemetryAck{
		EventId:  event.GetEventId(),
		Accepted: true,
	}, nil
}

// EmitTelemetryEvent is an internal API for the simulation engine to emit
// telemetry events directly without going through gRPC.
func (s *telemetryService) EmitTelemetryEvent(event *pb.TelemetryEvent) {
	if event.Timestamp == nil {
		now := time.Now().UTC()
		event.Timestamp = &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		}
	}

	s.storeEvent(event)
	s.broadcastEvent(event)
}

// EmitMentalBreakdown creates and emits a mental breakdown telemetry event.
func (s *telemetryService) EmitMentalBreakdown(
	npcID string,
	breakdownType pb.MentalBreakdownType,
	intensity float64,
	stressBefore, stressAfter float64,
	triggerContext string,
) {
	severity := severityFromIntensity(intensity)
	now := time.Now().UTC()

	event := &pb.TelemetryEvent{
		EventId:  fmt.Sprintf("mb-%s-%d", npcID, now.UnixNano()),
		NpcId:    npcID,
		Severity: severity,
		Timestamp: &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		},
		Payload: &pb.TelemetryEvent_MentalBreakdown{
			MentalBreakdown: &pb.MentalBreakdownEvent{
				Type:                breakdownType,
				Intensity:           intensity,
				StressBefore:        stressBefore,
				StressAfter:         stressAfter,
				TriggerContext:      triggerContext,
				Resolved:            false,
				RecoveryProbability: 1.0 - intensity,
			},
		},
	}

	// Attach NPC snapshot if available
	if npcState, exists := s.behaviorEngine.GetNPC(npcID); exists {
		event.NpcSnapshot = npcBehaviorToProtoState(npcState)
	}

	s.EmitTelemetryEvent(event)
	log.Printf("[Telemetry] Mental breakdown: %s → %v (intensity=%.2f)", npcID, breakdownType, intensity)
}

// EmitPermanentTrauma creates and emits a permanent trauma telemetry event.
func (s *telemetryService) EmitPermanentTrauma(
	npcID string,
	traumaType pb.PermanentTraumaType,
	severity float64,
	affectedAttribute string,
	attributeReduction float64,
	triggerContext string,
) {
	telSeverity := pb.TelemetrySeverity_TELEMETRY_SEVERITY_CRITICAL
	if severity >= 0.8 {
		telSeverity = pb.TelemetrySeverity_TELEMETRY_SEVERITY_CATASTROPHIC
	}

	now := time.Now().UTC()

	event := &pb.TelemetryEvent{
		EventId:  fmt.Sprintf("pt-%s-%d", npcID, now.UnixNano()),
		NpcId:    npcID,
		Severity: telSeverity,
		Timestamp: &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		},
		Payload: &pb.TelemetryEvent_PermanentTrauma{
			PermanentTrauma: &pb.PermanentTraumaEvent{
				Type:               traumaType,
				Severity:           severity,
				AffectedAttribute:  affectedAttribute,
				AttributeReduction: attributeReduction,
				TriggerContext:     triggerContext,
				InflictedAt: &pb.EpochTimestamp{
					Iso8601: now.Format(time.RFC3339),
					UnixMs:  now.UnixMilli(),
				},
			},
		},
	}

	// Attach NPC snapshot if available
	if npcState, exists := s.behaviorEngine.GetNPC(npcID); exists {
		event.NpcSnapshot = npcBehaviorToProtoState(npcState)
	}

	s.EmitTelemetryEvent(event)
	log.Printf("[Telemetry] PERMANENT TRAUMA: %s → %v (severity=%.2f, -%s by %.2f)",
		npcID, traumaType, severity, affectedAttribute, attributeReduction)
}

// EmitInfestationWarning emits a warning-level telemetry event when infestation exceeds 50.
func (s *telemetryService) EmitInfestationWarning(level float64) {
	now := time.Now().UTC()
	event := &pb.TelemetryEvent{
		EventId:  fmt.Sprintf("inf-warn-%d", now.UnixNano()),
		NpcId:    "system",
		Severity: pb.TelemetrySeverity_TELEMETRY_SEVERITY_WARNING,
		Timestamp: &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		},
		Payload: &pb.TelemetryEvent_StateChange{
			StateChange: &pb.StateChangeEvent{
				Attribute: "infestation_level",
				OldValue:  0,
				NewValue:  level,
				Cause:     "sustained rebellion + trauma accumulation",
			},
		},
	}
	s.EmitTelemetryEvent(event)
	log.Printf("[Telemetry] Infestation WARNING: level=%.1f", level)
}

// EmitPlagueHeartActivated emits a critical-level telemetry event when Plague Heart activates.
func (s *telemetryService) EmitPlagueHeartActivated(level float64) {
	now := time.Now().UTC()
	event := &pb.TelemetryEvent{
		EventId:  fmt.Sprintf("inf-plague-on-%d", now.UnixNano()),
		NpcId:    "system",
		Severity: pb.TelemetrySeverity_TELEMETRY_SEVERITY_CRITICAL,
		Timestamp: &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		},
		Payload: &pb.TelemetryEvent_StateChange{
			StateChange: &pb.StateChangeEvent{
				Attribute: "infestation_level",
				OldValue:  0,
				NewValue:  level,
				Cause:     "PLAGUE HEART ACTIVATED — production throttled to 50%",
			},
		},
	}
	s.EmitTelemetryEvent(event)
	log.Printf("[Telemetry] PLAGUE HEART ACTIVATED: level=%.1f — production throttled", level)
}

// EmitPlagueHeartCleared emits an info-level telemetry event when Plague Heart deactivates.
func (s *telemetryService) EmitPlagueHeartCleared(level float64) {
	now := time.Now().UTC()
	event := &pb.TelemetryEvent{
		EventId:  fmt.Sprintf("inf-plague-off-%d", now.UnixNano()),
		NpcId:    "system",
		Severity: pb.TelemetrySeverity_TELEMETRY_SEVERITY_INFO,
		Timestamp: &pb.EpochTimestamp{
			Iso8601: now.Format(time.RFC3339),
			UnixMs:  now.UnixMilli(),
		},
		Payload: &pb.TelemetryEvent_StateChange{
			StateChange: &pb.StateChangeEvent{
				Attribute: "infestation_level",
				OldValue:  0,
				NewValue:  level,
				Cause:     "Plague Heart cleared — production restored to 100%",
			},
		},
	}
	s.EmitTelemetryEvent(event)
	log.Printf("[Telemetry] Plague Heart cleared: level=%.1f — production restored", level)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (s *telemetryService) storeEvent(event *pb.TelemetryEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.recentEvents) < maxRecentEvents {
		s.recentEvents = append(s.recentEvents, event)
	} else {
		s.recentEvents[s.eventIndex] = event
		s.eventIndex = (s.eventIndex + 1) % maxRecentEvents
	}
	s.totalEmitted++
}

func (s *telemetryService) broadcastEvent(event *pb.TelemetryEvent) {
	s.subscriberMu.RLock()
	defer s.subscriberMu.RUnlock()

	for _, ch := range s.subscribers {
		select {
		case ch <- event:
			// Event sent
		default:
			// Subscriber channel full — drop event (0ms tolerance, don't block)
		}
	}
}

func (s *telemetryService) addSubscriber() (int64, chan *pb.TelemetryEvent) {
	s.subscriberMu.Lock()
	defer s.subscriberMu.Unlock()

	id := s.nextSubID
	s.nextSubID++
	ch := make(chan *pb.TelemetryEvent, 100) // Buffer 100 events per subscriber
	s.subscribers[id] = ch
	return id, ch
}

func (s *telemetryService) removeSubscriber(id int64) {
	s.subscriberMu.Lock()
	defer s.subscriberMu.Unlock()

	if ch, ok := s.subscribers[id]; ok {
		close(ch)
		delete(s.subscribers, id)
	}
}

func matchesFilter(event *pb.TelemetryEvent, filter *pb.TelemetryFilter) bool {
	// NPC filter
	if len(filter.GetNpcIds()) > 0 {
		found := false
		for _, id := range filter.GetNpcIds() {
			if id == event.GetNpcId() {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Severity filter
	if filter.GetMinSeverity() != pb.TelemetrySeverity_TELEMETRY_SEVERITY_UNSPECIFIED &&
		event.GetSeverity() < filter.GetMinSeverity() {
		return false
	}

	// Payload type filter
	switch event.Payload.(type) {
	case *pb.TelemetryEvent_MentalBreakdown:
		if !filter.GetIncludeMentalBreakdowns() && filter.GetMinSeverity() == pb.TelemetrySeverity_TELEMETRY_SEVERITY_UNSPECIFIED {
			return true // Default: include all if no specific filter set
		}
		return filter.GetIncludeMentalBreakdowns()
	case *pb.TelemetryEvent_PermanentTrauma:
		if !filter.GetIncludePermanentTraumas() && filter.GetMinSeverity() == pb.TelemetrySeverity_TELEMETRY_SEVERITY_UNSPECIFIED {
			return true
		}
		return filter.GetIncludePermanentTraumas()
	case *pb.TelemetryEvent_StateChange:
		if !filter.GetIncludeStateChanges() && filter.GetMinSeverity() == pb.TelemetrySeverity_TELEMETRY_SEVERITY_UNSPECIFIED {
			return true
		}
		return filter.GetIncludeStateChanges()
	}

	return true
}

func severityFromIntensity(intensity float64) pb.TelemetrySeverity {
	switch {
	case intensity >= 0.9:
		return pb.TelemetrySeverity_TELEMETRY_SEVERITY_CATASTROPHIC
	case intensity >= 0.7:
		return pb.TelemetrySeverity_TELEMETRY_SEVERITY_CRITICAL
	case intensity >= 0.4:
		return pb.TelemetrySeverity_TELEMETRY_SEVERITY_WARNING
	default:
		return pb.TelemetrySeverity_TELEMETRY_SEVERITY_INFO
	}
}

func npcBehaviorToProtoState(b *npc.NPCBehavior) *pb.NPCState {
	return &pb.NPCState{
		NpcId:                b.NPCID,
		Name:                 b.NPCID,
		WorkEfficiency:       b.WorkEfficiency,
		Morale:               b.Morale,
		RebellionProbability: 0, // Calculated separately by rebellion engine
	}
}
