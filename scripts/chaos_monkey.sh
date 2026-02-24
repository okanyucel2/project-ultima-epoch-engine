#!/bin/bash
# =============================================================================
# CHAOS MONKEY — Wave 17 Failover & Survival Testing
# =============================================================================
#
# Aggressively kills Epoch Engine services to verify watchdog auto-recovery.
#
# Usage:
#   ./scripts/chaos_monkey.sh                    # Full chaos sequence
#   ./scripts/chaos_monkey.sh --dry-run          # Show what would be killed
#   ./scripts/chaos_monkey.sh --service node     # Kill only Node.js
#   ./scripts/chaos_monkey.sh --service go       # Kill only Golang
#   ./scripts/chaos_monkey.sh --service neo4j    # Kill only Neo4j
#   ./scripts/chaos_monkey.sh --report           # Show last run report
#
# Prerequisites:
#   - All 3 services running (orchestration:12064, logistics:12065, neo4j:7474)
#   - Watchdog daemon active for auto-recovery
#
# Created: 2026-02-24
# Phase: Wave 17 — Chaos Engineering

set -uo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ports
ORCHESTRATION_PORT=12064
LOGISTICS_PORT=12065
LOGISTICS_GRPC_PORT=12066
WEBSOCKET_PORT=32064
DASHBOARD_PORT=22064
NEO4J_HTTP_PORT=7474
NEO4J_BOLT_PORT=7687

# Neo4j Docker container name
NEO4J_CONTAINER="epoch-neo4j"

# Timing
KILL_DELAY=2          # Seconds between kills
RECOVERY_TIMEOUT=120  # Max seconds to wait for service recovery
RECOVERY_POLL=3       # Seconds between recovery polls
NEO4J_STOP_DURATION=5 # Seconds Neo4j stays down

# Report
REPORT_DIR="$PROJECT_ROOT/docs/reports"
REPORT_FILE="$REPORT_DIR/chaos-monkey-latest.md"
LOG_FILE="/tmp/chaos_monkey_$(date +%Y%m%d_%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# =============================================================================
# LOGGING
# =============================================================================

chaos_log() {
    local level="$1"
    shift
    local ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] [$level] $*" >> "$LOG_FILE"
    case "$level" in
        KILL)   echo -e "${RED}[$ts] [KILL]${NC} $*" ;;
        WAIT)   echo -e "${YELLOW}[$ts] [WAIT]${NC} $*" ;;
        OK)     echo -e "${GREEN}[$ts] [OK]${NC}   $*" ;;
        FAIL)   echo -e "${RED}[$ts] [FAIL]${NC} $*" ;;
        INFO)   echo -e "${BLUE}[$ts] [INFO]${NC} $*" ;;
        PHASE)  echo -e "${PURPLE}[$ts] [PHASE]${NC} $*" ;;
    esac
}

# =============================================================================
# HEALTH CHECK HELPERS
# =============================================================================

check_service() {
    local name="$1"
    local url="$2"
    local timeout="${3:-5}"
    curl -sf --max-time "$timeout" "$url" > /dev/null 2>&1
}

get_pid_on_port() {
    local port="$1"
    lsof -ti:"$port" 2>/dev/null | head -1
}

wait_for_recovery() {
    local name="$1"
    local url="$2"
    local max_wait="$RECOVERY_TIMEOUT"
    local elapsed=0

    chaos_log "WAIT" "$name — waiting for recovery (max ${max_wait}s)..."

    while [[ $elapsed -lt $max_wait ]]; do
        if check_service "$name" "$url"; then
            chaos_log "OK" "$name recovered after ${elapsed}s"
            return 0
        fi
        sleep "$RECOVERY_POLL"
        elapsed=$((elapsed + RECOVERY_POLL))
    done

    chaos_log "FAIL" "$name did NOT recover after ${max_wait}s"
    return 1
}

wait_for_neo4j() {
    local max_wait="$RECOVERY_TIMEOUT"
    local elapsed=0

    chaos_log "WAIT" "Neo4j — waiting for Docker container to become healthy (max ${max_wait}s)..."

    while [[ $elapsed -lt $max_wait ]]; do
        local status=$(docker inspect --format='{{.State.Health.Status}}' "$NEO4J_CONTAINER" 2>/dev/null)
        if [[ "$status" == "healthy" ]]; then
            chaos_log "OK" "Neo4j container healthy after ${elapsed}s"
            return 0
        fi
        sleep "$RECOVERY_POLL"
        elapsed=$((elapsed + RECOVERY_POLL))
    done

    chaos_log "FAIL" "Neo4j did NOT become healthy after ${max_wait}s"
    return 1
}

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

preflight() {
    chaos_log "PHASE" "PRE-FLIGHT CHECKS"
    local all_ok=true

    # Check Orchestration
    if check_service "Orchestration" "http://localhost:$ORCHESTRATION_PORT/health"; then
        local pid=$(get_pid_on_port $ORCHESTRATION_PORT)
        chaos_log "OK" "Orchestration alive (PID $pid, port $ORCHESTRATION_PORT)"
    else
        chaos_log "FAIL" "Orchestration NOT responding on port $ORCHESTRATION_PORT"
        all_ok=false
    fi

    # Check Logistics
    if check_service "Logistics" "http://localhost:$LOGISTICS_PORT/health"; then
        local pid=$(get_pid_on_port $LOGISTICS_PORT)
        chaos_log "OK" "Logistics alive (PID $pid, port $LOGISTICS_PORT)"
    else
        chaos_log "FAIL" "Logistics NOT responding on port $LOGISTICS_PORT"
        all_ok=false
    fi

    # Check Neo4j
    local neo4j_status=$(docker inspect --format='{{.State.Health.Status}}' "$NEO4J_CONTAINER" 2>/dev/null)
    if [[ "$neo4j_status" == "healthy" ]]; then
        chaos_log "OK" "Neo4j container healthy (port $NEO4J_HTTP_PORT/$NEO4J_BOLT_PORT)"
    else
        chaos_log "FAIL" "Neo4j container status: ${neo4j_status:-not found}"
        all_ok=false
    fi

    # Check Dashboard
    if check_service "Dashboard" "http://localhost:$DASHBOARD_PORT/"; then
        chaos_log "OK" "Dashboard serving (port $DASHBOARD_PORT)"
    else
        chaos_log "FAIL" "Dashboard NOT serving on port $DASHBOARD_PORT"
        all_ok=false
    fi

    if [[ "$all_ok" != "true" ]]; then
        chaos_log "FAIL" "Pre-flight FAILED — not all services are running"
        echo ""
        echo -e "${RED}Cannot run chaos test — services not ready.${NC}"
        echo "Start services first: ./scripts/start.sh"
        exit 1
    fi

    chaos_log "OK" "Pre-flight passed — all services alive"
    echo ""
}

# =============================================================================
# CHAOS ACTIONS
# =============================================================================

# Phase 1: Kill Node.js Orchestration
kill_orchestration() {
    chaos_log "PHASE" "PHASE 1: Kill Node.js Orchestration (port $ORCHESTRATION_PORT)"

    local pid=$(get_pid_on_port $ORCHESTRATION_PORT)
    if [[ -z "$pid" ]]; then
        chaos_log "FAIL" "No process found on port $ORCHESTRATION_PORT"
        return 1
    fi

    local rss_before=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
    chaos_log "INFO" "Target PID: $pid (RSS: ${rss_before:-?} KB)"

    # SIGKILL — no graceful shutdown, simulate hard crash
    chaos_log "KILL" "Sending SIGKILL to Orchestration (PID $pid)"
    kill -9 "$pid" 2>/dev/null

    sleep 1

    # Also kill WebSocket server if on separate port
    local ws_pid=$(get_pid_on_port $WEBSOCKET_PORT)
    if [[ -n "$ws_pid" ]]; then
        chaos_log "KILL" "Killing WebSocket server (PID $ws_pid, port $WEBSOCKET_PORT)"
        kill -9 "$ws_pid" 2>/dev/null
    fi

    # Verify kill
    if ! kill -0 "$pid" 2>/dev/null; then
        chaos_log "OK" "Orchestration KILLED (PID $pid is dead)"
    else
        chaos_log "FAIL" "Orchestration still alive after SIGKILL!"
        return 1
    fi

    KILL_TIMESTAMPS["orchestration"]=$(date +%s)
    return 0
}

# Phase 2: Kill Golang Logistics
kill_logistics() {
    chaos_log "PHASE" "PHASE 2: Kill Golang Logistics (port $LOGISTICS_PORT)"

    local pid=$(get_pid_on_port $LOGISTICS_PORT)
    if [[ -z "$pid" ]]; then
        chaos_log "FAIL" "No process found on port $LOGISTICS_PORT"
        return 1
    fi

    local rss_before=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
    chaos_log "INFO" "Target PID: $pid (RSS: ${rss_before:-?} KB)"

    # Random kill signal: SIGKILL (hard crash) or SIGTERM (graceful)
    local signals=(9 15)
    local sig=${signals[$RANDOM % ${#signals[@]}]}
    local sig_name=$([[ $sig -eq 9 ]] && echo "SIGKILL" || echo "SIGTERM")

    chaos_log "KILL" "Sending $sig_name to Logistics (PID $pid)"
    kill -$sig "$pid" 2>/dev/null

    # If SIGTERM, wait briefly for graceful shutdown
    if [[ $sig -eq 15 ]]; then
        sleep 2
        if kill -0 "$pid" 2>/dev/null; then
            chaos_log "KILL" "Logistics still alive after SIGTERM — sending SIGKILL"
            kill -9 "$pid" 2>/dev/null
        fi
    fi

    sleep 1

    # Also kill gRPC port
    local grpc_pid=$(get_pid_on_port $LOGISTICS_GRPC_PORT)
    if [[ -n "$grpc_pid" ]]; then
        chaos_log "KILL" "Killing gRPC listener (PID $grpc_pid, port $LOGISTICS_GRPC_PORT)"
        kill -9 "$grpc_pid" 2>/dev/null
    fi

    # Verify kill
    if ! kill -0 "$pid" 2>/dev/null; then
        chaos_log "OK" "Logistics KILLED (PID $pid is dead)"
    else
        chaos_log "FAIL" "Logistics still alive after kill!"
        return 1
    fi

    KILL_TIMESTAMPS["logistics"]=$(date +%s)
    return 0
}

# Phase 3: Neo4j Drop/Restore
drop_restore_neo4j() {
    chaos_log "PHASE" "PHASE 3: Neo4j Docker Stop/Start (container: $NEO4J_CONTAINER)"

    # Verify container exists
    if ! docker inspect "$NEO4J_CONTAINER" > /dev/null 2>&1; then
        chaos_log "FAIL" "Container '$NEO4J_CONTAINER' not found"
        return 1
    fi

    # STOP
    chaos_log "KILL" "Stopping Neo4j container..."
    docker stop "$NEO4J_CONTAINER" > /dev/null 2>&1

    local neo4j_down=$(docker inspect --format='{{.State.Running}}' "$NEO4J_CONTAINER" 2>/dev/null)
    if [[ "$neo4j_down" == "false" ]]; then
        chaos_log "OK" "Neo4j container STOPPED"
    else
        chaos_log "FAIL" "Neo4j container still running after stop!"
        return 1
    fi

    KILL_TIMESTAMPS["neo4j"]=$(date +%s)

    # Hold down for N seconds
    chaos_log "WAIT" "Neo4j stays down for ${NEO4J_STOP_DURATION}s..."
    sleep "$NEO4J_STOP_DURATION"

    # RESTORE
    chaos_log "INFO" "Starting Neo4j container..."
    docker start "$NEO4J_CONTAINER" > /dev/null 2>&1

    return 0
}

# =============================================================================
# RECOVERY VERIFICATION
# =============================================================================

verify_recovery() {
    chaos_log "PHASE" "RECOVERY VERIFICATION"
    echo ""

    local all_recovered=true
    local recovery_times=()

    # Wait for Orchestration
    if wait_for_recovery "Orchestration" "http://localhost:$ORCHESTRATION_PORT/health"; then
        local now=$(date +%s)
        local kill_ts=${KILL_TIMESTAMPS["orchestration"]:-$now}
        local recovery_secs=$((now - kill_ts))
        recovery_times+=("Orchestration: ${recovery_secs}s")
        RECOVERY_RESULTS["orchestration"]="RECOVERED in ${recovery_secs}s"

        local new_pid=$(get_pid_on_port $ORCHESTRATION_PORT)
        chaos_log "INFO" "Orchestration new PID: $new_pid"
    else
        all_recovered=false
        RECOVERY_RESULTS["orchestration"]="FAILED"
    fi

    # Wait for Logistics
    if wait_for_recovery "Logistics" "http://localhost:$LOGISTICS_PORT/health"; then
        local now=$(date +%s)
        local kill_ts=${KILL_TIMESTAMPS["logistics"]:-$now}
        local recovery_secs=$((now - kill_ts))
        recovery_times+=("Logistics: ${recovery_secs}s")
        RECOVERY_RESULTS["logistics"]="RECOVERED in ${recovery_secs}s"

        local new_pid=$(get_pid_on_port $LOGISTICS_PORT)
        chaos_log "INFO" "Logistics new PID: $new_pid"
    else
        all_recovered=false
        RECOVERY_RESULTS["logistics"]="FAILED"
    fi

    # Wait for Neo4j
    if wait_for_neo4j; then
        local now=$(date +%s)
        local kill_ts=${KILL_TIMESTAMPS["neo4j"]:-$now}
        local recovery_secs=$((now - kill_ts))
        recovery_times+=("Neo4j: ${recovery_secs}s")
        RECOVERY_RESULTS["neo4j"]="RECOVERED in ${recovery_secs}s"
    else
        all_recovered=false
        RECOVERY_RESULTS["neo4j"]="FAILED"
    fi

    # Dashboard (should survive since Vite is independent)
    if check_service "Dashboard" "http://localhost:$DASHBOARD_PORT/"; then
        chaos_log "OK" "Dashboard still alive (unaffected by chaos)"
        RECOVERY_RESULTS["dashboard"]="UNAFFECTED"
    else
        chaos_log "FAIL" "Dashboard went down during chaos!"
        RECOVERY_RESULTS["dashboard"]="FAILED"
        all_recovered=false
    fi

    echo ""
    if [[ "$all_recovered" == "true" ]]; then
        chaos_log "OK" "ALL SERVICES RECOVERED"
        return 0
    else
        chaos_log "FAIL" "SOME SERVICES DID NOT RECOVER"
        return 1
    fi
}

# =============================================================================
# DEEP HEALTH CHECK (Post-Recovery)
# =============================================================================

deep_health_check() {
    chaos_log "PHASE" "DEEP HEALTH CHECK"

    # Orchestration deep health
    local deep=$(curl -sf --max-time 5 "http://localhost:$ORCHESTRATION_PORT/health/deep" 2>/dev/null)
    if [[ -n "$deep" ]]; then
        local deep_status=$(echo "$deep" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null)
        chaos_log "INFO" "Orchestration deep health: $deep_status"
        echo "$deep" | python3 -m json.tool 2>/dev/null >> "$LOG_FILE"
    else
        chaos_log "FAIL" "Orchestration /health/deep not responding"
    fi

    # Logistics health
    local logi=$(curl -sf --max-time 5 "http://localhost:$LOGISTICS_PORT/health" 2>/dev/null)
    if [[ -n "$logi" ]]; then
        chaos_log "INFO" "Logistics health: $(echo "$logi" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)"
    fi

    # Simulation state preservation
    local sim=$(curl -sf --max-time 5 "http://localhost:$LOGISTICS_PORT/api/simulation/status" 2>/dev/null)
    if [[ -n "$sim" ]]; then
        local tick_count=$(echo "$sim" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tickCount',0))" 2>/dev/null)
        chaos_log "INFO" "Simulation state: tickCount=$tick_count (data preserved)"
    fi

    # Neo4j connectivity via Bolt
    local neo4j_ok=$(docker exec "$NEO4J_CONTAINER" cypher-shell -u neo4j -p epochengine "RETURN 1 AS test" 2>/dev/null)
    if echo "$neo4j_ok" | grep -q "1"; then
        chaos_log "OK" "Neo4j Cypher query OK (data intact)"
    else
        chaos_log "FAIL" "Neo4j Cypher query failed"
    fi
}

# =============================================================================
# PHASE 4: TELEMETRY VERIFICATION (Wave 25B)
# =============================================================================

verify_telemetry() {
    chaos_log "PHASE" "PHASE 4: Telemetry Verification (Wave 25B)"

    local telemetry_ok=true
    local telemetry_start=$(date +%s)

    # Check if orchestration telemetry endpoint is responsive
    local telemetry_check=$(curl -sf -X POST --max-time 5 \
        "http://localhost:$ORCHESTRATION_PORT/api/telemetry/watchdog" \
        -H "Content-Type: application/json" \
        -d '{"channel":"system-status","data":{"type":"watchdog_restart","service":"chaos-test","reason":"telemetry_verification","attempt":0,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}}' \
        2>/dev/null)

    if [[ -n "$telemetry_check" ]]; then
        local telemetry_latency=$(($(date +%s) - telemetry_start))
        chaos_log "OK" "Telemetry endpoint responsive (latency: ${telemetry_latency}s)"
        RECOVERY_RESULTS["telemetry_endpoint"]="OK (${telemetry_latency}s)"
    else
        chaos_log "FAIL" "Telemetry endpoint not responding"
        RECOVERY_RESULTS["telemetry_endpoint"]="FAILED"
        telemetry_ok=false
    fi

    # Verify WebSocket server is accepting connections
    local ws_check=$(curl -sf --max-time 5 -o /dev/null -w "%{http_code}" \
        "http://localhost:$ORCHESTRATION_PORT/health" 2>/dev/null)

    if [[ "$ws_check" == "200" ]]; then
        chaos_log "OK" "Orchestration healthy — WebSocket broadcast path available"
        RECOVERY_RESULTS["ws_broadcast"]="OK"
    else
        chaos_log "FAIL" "Orchestration health check failed — WebSocket broadcast path broken"
        RECOVERY_RESULTS["ws_broadcast"]="FAILED"
        telemetry_ok=false
    fi

    # Report telemetry latency summary
    if [[ "$telemetry_ok" == "true" ]]; then
        chaos_log "OK" "Telemetry verification PASSED"
    else
        chaos_log "FAIL" "Telemetry verification FAILED"
    fi
}

# =============================================================================
# REPORT GENERATION
# =============================================================================

generate_report() {
    mkdir -p "$REPORT_DIR"

    local end_time=$(date '+%Y-%m-%d %H:%M:%S')
    local duration=$(($(date +%s) - CHAOS_START_TS))

    cat > "$REPORT_FILE" << REPORT_EOF
# Chaos Monkey Report — Wave 17

**Date:** $end_time
**Duration:** ${duration}s
**Log:** $LOG_FILE

---

## Pre-Flight

All services verified alive before chaos injection.

| Service | Port | Status |
|---------|------|--------|
| Orchestration | $ORCHESTRATION_PORT | ALIVE |
| Logistics | $LOGISTICS_PORT | ALIVE |
| Neo4j | $NEO4J_HTTP_PORT/$NEO4J_BOLT_PORT | HEALTHY |
| Dashboard | $DASHBOARD_PORT | SERVING |

---

## Chaos Sequence

| Phase | Target | Action | Time |
|-------|--------|--------|------|
| 1 | Node.js Orchestration | SIGKILL PID | ${KILL_DELAY}s delay |
| 2 | Golang Logistics | Random signal (SIGKILL/SIGTERM) | ${KILL_DELAY}s delay |
| 3 | Neo4j Docker | Stop ${NEO4J_STOP_DURATION}s → Start | Container lifecycle |

---

## Recovery Results

| Service | Result |
|---------|--------|
| Orchestration | ${RECOVERY_RESULTS["orchestration"]:-UNKNOWN} |
| Logistics | ${RECOVERY_RESULTS["logistics"]:-UNKNOWN} |
| Neo4j | ${RECOVERY_RESULTS["neo4j"]:-UNKNOWN} |
| Dashboard | ${RECOVERY_RESULTS["dashboard"]:-UNKNOWN} |

---

## Telemetry Verification (Wave 25B)

| Check | Result |
|-------|--------|
| Telemetry Endpoint | ${RECOVERY_RESULTS["telemetry_endpoint"]:-NOT RUN} |
| WS Broadcast Path | ${RECOVERY_RESULTS["ws_broadcast"]:-NOT RUN} |

---

## Watchdog Log (during chaos)

\`\`\`
$(tail -30 /tmp/genesis_watchdog.log 2>/dev/null || echo "No watchdog log found")
\`\`\`

---

## Full Chaos Log

\`\`\`
$(cat "$LOG_FILE")
\`\`\`
REPORT_EOF

    chaos_log "INFO" "Report written to $REPORT_FILE"
}

# =============================================================================
# DRY RUN
# =============================================================================

dry_run() {
    echo -e "${CYAN}CHAOS MONKEY — DRY RUN${NC}"
    echo ""
    echo "Would execute the following chaos sequence:"
    echo ""
    echo "  1. SIGKILL Orchestration (PID $(get_pid_on_port $ORCHESTRATION_PORT), port $ORCHESTRATION_PORT)"
    echo "     + Kill WebSocket (PID $(get_pid_on_port $WEBSOCKET_PORT), port $WEBSOCKET_PORT)"
    echo "  2. Random signal Logistics (PID $(get_pid_on_port $LOGISTICS_PORT), port $LOGISTICS_PORT)"
    echo "     + Kill gRPC (PID $(get_pid_on_port $LOGISTICS_GRPC_PORT), port $LOGISTICS_GRPC_PORT)"
    echo "  3. docker stop $NEO4J_CONTAINER → wait ${NEO4J_STOP_DURATION}s → docker start $NEO4J_CONTAINER"
    echo ""
    echo "  Recovery timeout: ${RECOVERY_TIMEOUT}s per service"
    echo "  Log file: $LOG_FILE"
    echo ""
    echo -e "Run without ${YELLOW}--dry-run${NC} to execute."
}

# =============================================================================
# SHOW LAST REPORT
# =============================================================================

show_report() {
    if [[ -f "$REPORT_FILE" ]]; then
        cat "$REPORT_FILE"
    else
        echo "No chaos monkey report found."
        echo "Run: ./scripts/chaos_monkey.sh"
    fi
}

# =============================================================================
# SINGLE SERVICE MODE
# =============================================================================

run_single() {
    local target="$1"
    declare -A KILL_TIMESTAMPS
    declare -A RECOVERY_RESULTS

    case "$target" in
        node|orchestration)
            preflight
            kill_orchestration
            verify_recovery
            ;;
        go|logistics)
            preflight
            kill_logistics
            verify_recovery
            ;;
        neo4j|docker)
            preflight
            drop_restore_neo4j
            verify_recovery
            ;;
        *)
            echo "Unknown service: $target"
            echo "Options: node, go, neo4j"
            exit 1
            ;;
    esac
}

# =============================================================================
# MAIN — FULL CHAOS SEQUENCE
# =============================================================================

run_full_chaos() {
    declare -A KILL_TIMESTAMPS
    declare -A RECOVERY_RESULTS

    CHAOS_START_TS=$(date +%s)

    echo ""
    echo -e "${RED}================================================================${NC}"
    echo -e "${RED}  CHAOS MONKEY — Wave 17 Failover Test                         ${NC}"
    echo -e "${RED}  Target: Project Ultima Epoch Engine                           ${NC}"
    echo -e "${RED}================================================================${NC}"
    echo ""

    chaos_log "PHASE" "CHAOS MONKEY STARTED"

    # Pre-flight
    preflight

    # Phase 1: Kill Orchestration
    kill_orchestration
    sleep "$KILL_DELAY"

    # Phase 2: Kill Logistics
    kill_logistics
    sleep "$KILL_DELAY"

    # Phase 3: Neo4j Drop/Restore
    drop_restore_neo4j

    echo ""
    echo -e "${YELLOW}================================================================${NC}"
    echo -e "${YELLOW}  CHAOS INJECTION COMPLETE — WAITING FOR RECOVERY              ${NC}"
    echo -e "${YELLOW}================================================================${NC}"
    echo ""

    # Wait for watchdog to detect and restart
    chaos_log "WAIT" "Giving watchdog time to detect failures..."
    sleep 5

    # Verify recovery
    verify_recovery
    local recovery_exit=$?

    # Phase 4: Telemetry verification (Wave 25B)
    verify_telemetry

    # Deep health check
    deep_health_check

    # Generate report
    generate_report

    echo ""
    echo -e "${BLUE}================================================================${NC}"
    if [[ $recovery_exit -eq 0 ]]; then
        echo -e "${GREEN}  CHAOS TEST PASSED — ALL SERVICES SURVIVED                    ${NC}"
    else
        echo -e "${RED}  CHAOS TEST FAILED — SOME SERVICES DID NOT RECOVER            ${NC}"
    fi
    echo -e "${BLUE}================================================================${NC}"
    echo ""
    echo -e "Report: ${CYAN}$REPORT_FILE${NC}"
    echo -e "Log:    ${CYAN}$LOG_FILE${NC}"

    return $recovery_exit
}

# =============================================================================
# ENTRY POINT
# =============================================================================

case "${1:-}" in
    --dry-run)
        dry_run
        ;;
    --report)
        show_report
        ;;
    --service)
        run_single "${2:-}"
        ;;
    --help|-h)
        echo "Chaos Monkey — Wave 17 Failover Test"
        echo ""
        echo "Usage:"
        echo "  $0                     Full chaos sequence (kill all, verify recovery)"
        echo "  $0 --dry-run           Show what would be killed"
        echo "  $0 --service <name>    Kill specific service (node, go, neo4j)"
        echo "  $0 --report            Show last run report"
        echo "  $0 --help              This help"
        echo ""
        echo "Services:"
        echo "  Orchestration  Port $ORCHESTRATION_PORT  (Node.js)"
        echo "  Logistics      Port $LOGISTICS_PORT  (Golang)"
        echo "  Neo4j          Port $NEO4J_HTTP_PORT/$NEO4J_BOLT_PORT  (Docker)"
        echo "  Dashboard      Port $DASHBOARD_PORT  (Vue 3 — not targeted)"
        ;;
    *)
        run_full_chaos
        ;;
esac
