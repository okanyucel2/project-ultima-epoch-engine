#!/usr/bin/env bash
# =============================================================================
# PHOENIX PROTOCOL — Autonomous Deadlock Recovery (Wave 25C)
# =============================================================================
#
# Detects and recovers from deadlock conditions:
#   1. All 3 services down simultaneously
#   2. Neo4j unreachable + RetryQueue near capacity
#   3. Plague Heart (infestation > 95%) with logistics frozen
#
# Usage:
#   scripts/phoenix_protocol.sh --project project-ultima-epoch-engine
#   scripts/phoenix_protocol.sh --diagnose-only
#
# Created: 2026-02-24
# Phase: Wave 25C — Phoenix Protocol Foundation

set -uo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ORCHESTRATION_PORT=12064
LOGISTICS_PORT=12065
DASHBOARD_PORT=22064
WEBSOCKET_PORT=32064
NEO4J_HTTP_PORT=7474
NEO4J_BOLT_PORT=7687
NEO4J_CONTAINER="epoch-neo4j"

REPORT_DIR="$PROJECT_ROOT/docs/reports"
RECOVERY_LOG="$REPORT_DIR/phoenix-recovery-log.md"
PHOENIX_LOG="/tmp/phoenix_protocol_$(date +%Y%m%d_%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

DIAGNOSE_ONLY=false
PROJECT_SLUG="project-ultima-epoch-engine"

# =============================================================================
# LOGGING
# =============================================================================

phoenix_log() {
    local level="$1"
    shift
    local ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] [$level] $*" >> "$PHOENIX_LOG"
    case "$level" in
        DIAG)   echo -e "${CYAN}[$ts] [DIAG]${NC}    $*" ;;
        DRAIN)  echo -e "${YELLOW}[$ts] [DRAIN]${NC}   $*" ;;
        RESTART)echo -e "${PURPLE}[$ts] [RESTART]${NC} $*" ;;
        VERIFY) echo -e "${BLUE}[$ts] [VERIFY]${NC}  $*" ;;
        OK)     echo -e "${GREEN}[$ts] [OK]${NC}      $*" ;;
        FAIL)   echo -e "${RED}[$ts] [FAIL]${NC}    $*" ;;
        INFO)   echo -e "${BLUE}[$ts] [INFO]${NC}    $*" ;;
    esac
}

# =============================================================================
# PHASE 1: DIAGNOSE
# =============================================================================

check_port() {
    local name="$1" port="$2"
    if curl -sf --max-time 3 "http://localhost:$port/health" > /dev/null 2>&1; then
        phoenix_log "DIAG" "$name (port $port): ALIVE"
        return 0
    else
        phoenix_log "DIAG" "$name (port $port): DOWN"
        return 1
    fi
}

diagnose() {
    phoenix_log "INFO" "=== PHOENIX PROTOCOL — PHASE 1: DIAGNOSE ==="
    echo ""

    local down_count=0
    local services_down=()

    # Check Orchestration
    if ! check_port "Orchestration" "$ORCHESTRATION_PORT"; then
        down_count=$((down_count + 1))
        services_down+=("orchestration")
    fi

    # Check Logistics
    if ! check_port "Logistics" "$LOGISTICS_PORT"; then
        down_count=$((down_count + 1))
        services_down+=("logistics")
    fi

    # Check Dashboard
    if curl -sf --max-time 3 "http://localhost:$DASHBOARD_PORT/" > /dev/null 2>&1; then
        phoenix_log "DIAG" "Dashboard (port $DASHBOARD_PORT): ALIVE"
    else
        phoenix_log "DIAG" "Dashboard (port $DASHBOARD_PORT): DOWN"
        down_count=$((down_count + 1))
        services_down+=("dashboard")
    fi

    # Check Neo4j
    local neo4j_status=$(docker inspect --format='{{.State.Health.Status}}' "$NEO4J_CONTAINER" 2>/dev/null || echo "not_found")
    if [[ "$neo4j_status" == "healthy" ]]; then
        phoenix_log "DIAG" "Neo4j ($NEO4J_CONTAINER): HEALTHY"
    else
        phoenix_log "DIAG" "Neo4j ($NEO4J_CONTAINER): $neo4j_status"
        down_count=$((down_count + 1))
        services_down+=("neo4j")
    fi

    # Check RetryQueue stats via deep health
    local deep_health=$(curl -sf --max-time 5 "http://localhost:$ORCHESTRATION_PORT/health/deep" 2>/dev/null)
    if [[ -n "$deep_health" ]]; then
        phoenix_log "DIAG" "Deep health available — orchestration responsive"
    else
        phoenix_log "DIAG" "Deep health unavailable — orchestration not responding"
    fi

    echo ""
    phoenix_log "INFO" "Diagnosis: $down_count service(s) down [${services_down[*]:-none}]"

    if [[ $down_count -eq 0 ]]; then
        phoenix_log "OK" "All services healthy — no recovery needed"
        return 0
    fi

    if [[ $down_count -ge 3 ]]; then
        phoenix_log "FAIL" "DEADLOCK DETECTED — $down_count services down"
    fi

    return $down_count
}

# =============================================================================
# PHASE 2: DRAIN
# =============================================================================

drain_retry_queue() {
    phoenix_log "INFO" "=== PHOENIX PROTOCOL — PHASE 2: DRAIN ==="

    # Try to drain via the phoenix endpoint (if orchestration is alive)
    local drain_result=$(curl -sf -X POST --max-time 10 \
        "http://localhost:$ORCHESTRATION_PORT/api/phoenix/drain" \
        -H "Content-Type: application/json" 2>/dev/null)

    if [[ -n "$drain_result" ]]; then
        phoenix_log "DRAIN" "RetryQueue drain response: $drain_result"
    else
        phoenix_log "DRAIN" "Orchestration unreachable — drain skipped (will drain on restart)"
    fi
}

# =============================================================================
# PHASE 3: RESTART (ordered)
# =============================================================================

restart_services() {
    phoenix_log "INFO" "=== PHOENIX PROTOCOL — PHASE 3: RESTART ==="
    echo ""

    # 1. Neo4j first (foundation)
    local neo4j_status=$(docker inspect --format='{{.State.Running}}' "$NEO4J_CONTAINER" 2>/dev/null)
    if [[ "$neo4j_status" != "true" ]]; then
        phoenix_log "RESTART" "Starting Neo4j container..."
        docker start "$NEO4J_CONTAINER" > /dev/null 2>&1
        # Wait for Neo4j to become healthy
        local elapsed=0
        while [[ $elapsed -lt 60 ]]; do
            local health=$(docker inspect --format='{{.State.Health.Status}}' "$NEO4J_CONTAINER" 2>/dev/null)
            if [[ "$health" == "healthy" ]]; then
                phoenix_log "OK" "Neo4j healthy after ${elapsed}s"
                break
            fi
            sleep 3
            elapsed=$((elapsed + 3))
        done
    else
        phoenix_log "OK" "Neo4j already running"
    fi

    # 2. Logistics (Go — fast startup)
    if ! curl -sf --max-time 3 "http://localhost:$LOGISTICS_PORT/health" > /dev/null 2>&1; then
        phoenix_log "RESTART" "Starting Logistics..."
        lsof -ti:$LOGISTICS_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
        sleep 0.5
        cd "$PROJECT_ROOT"
        nohup bash -c "cd logistics && go run cmd/server/main.go" > /tmp/${PROJECT_SLUG}_logistics.log 2>&1 &
        phoenix_log "RESTART" "Logistics started (PID $!)"
        sleep 3
    else
        phoenix_log "OK" "Logistics already running"
    fi

    # 3. Orchestration (Node.js — depends on Neo4j)
    if ! curl -sf --max-time 3 "http://localhost:$ORCHESTRATION_PORT/health" > /dev/null 2>&1; then
        phoenix_log "RESTART" "Starting Orchestration..."
        lsof -ti:$ORCHESTRATION_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
        lsof -ti:$WEBSOCKET_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
        sleep 0.5
        cd "$PROJECT_ROOT"
        nohup bash -c "cd orchestration && npm run dev" > /tmp/${PROJECT_SLUG}_backend.log 2>&1 &
        phoenix_log "RESTART" "Orchestration started (PID $!)"
        sleep 5
    else
        phoenix_log "OK" "Orchestration already running"
    fi

    # 4. Dashboard (Vue — independent)
    if ! curl -sf --max-time 3 "http://localhost:$DASHBOARD_PORT/" > /dev/null 2>&1; then
        phoenix_log "RESTART" "Starting Dashboard..."
        lsof -ti:$DASHBOARD_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
        sleep 0.5
        cd "$PROJECT_ROOT"
        nohup bash -c "cd dashboard && npm run dev -- --port $DASHBOARD_PORT --host" > /tmp/${PROJECT_SLUG}_frontend.log 2>&1 &
        phoenix_log "RESTART" "Dashboard started (PID $!)"
        sleep 3
    else
        phoenix_log "OK" "Dashboard already running"
    fi
}

# =============================================================================
# PHASE 4: VERIFY
# =============================================================================

verify_recovery() {
    phoenix_log "INFO" "=== PHOENIX PROTOCOL — PHASE 4: VERIFY ==="
    echo ""

    local all_ok=true

    # Orchestration
    if curl -sf --max-time 5 "http://localhost:$ORCHESTRATION_PORT/health" > /dev/null 2>&1; then
        phoenix_log "VERIFY" "Orchestration: OK"
    else
        phoenix_log "FAIL" "Orchestration: STILL DOWN"
        all_ok=false
    fi

    # Logistics
    if curl -sf --max-time 5 "http://localhost:$LOGISTICS_PORT/health" > /dev/null 2>&1; then
        phoenix_log "VERIFY" "Logistics: OK"
    else
        phoenix_log "FAIL" "Logistics: STILL DOWN"
        all_ok=false
    fi

    # Dashboard
    if curl -sf --max-time 5 "http://localhost:$DASHBOARD_PORT/" > /dev/null 2>&1; then
        phoenix_log "VERIFY" "Dashboard: OK"
    else
        phoenix_log "FAIL" "Dashboard: STILL DOWN"
        all_ok=false
    fi

    # Neo4j
    local neo_health=$(docker inspect --format='{{.State.Health.Status}}' "$NEO4J_CONTAINER" 2>/dev/null)
    if [[ "$neo_health" == "healthy" ]]; then
        phoenix_log "VERIFY" "Neo4j: HEALTHY"
    else
        phoenix_log "FAIL" "Neo4j: $neo_health"
        all_ok=false
    fi

    # Deep health
    local deep=$(curl -sf --max-time 5 "http://localhost:$ORCHESTRATION_PORT/health/deep" 2>/dev/null)
    if [[ -n "$deep" ]]; then
        local status=$(echo "$deep" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
        phoenix_log "VERIFY" "Deep health: $status"
    fi

    echo ""
    if [[ "$all_ok" == "true" ]]; then
        phoenix_log "OK" "PHOENIX PROTOCOL COMPLETE — ALL SERVICES RECOVERED"
        return 0
    else
        phoenix_log "FAIL" "PHOENIX PROTOCOL INCOMPLETE — MANUAL INTERVENTION NEEDED"
        return 1
    fi
}

# =============================================================================
# PHASE 5: LOG
# =============================================================================

log_recovery() {
    mkdir -p "$REPORT_DIR"

    local ts=$(date '+%Y-%m-%d %H:%M:%S')
    local entry="| $ts | $(diagnose 2>/dev/null; echo $?) services down | Auto | See $PHOENIX_LOG |"

    if [[ ! -f "$RECOVERY_LOG" ]]; then
        cat > "$RECOVERY_LOG" << 'EOF'
# Phoenix Protocol Recovery Log

| Date | Condition | Recovery | Log |
|------|-----------|----------|-----|
EOF
    fi

    echo "$entry" >> "$RECOVERY_LOG"
    phoenix_log "INFO" "Recovery logged to $RECOVERY_LOG"
}

# =============================================================================
# MAIN
# =============================================================================

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --diagnose-only)
            DIAGNOSE_ONLY=true
            shift
            ;;
        --project)
            PROJECT_SLUG="$2"
            shift 2
            ;;
        --help|-h)
            echo "Phoenix Protocol — Autonomous Deadlock Recovery (Wave 25C)"
            echo ""
            echo "Usage:"
            echo "  $0                              Full recovery sequence"
            echo "  $0 --diagnose-only              Diagnose without recovery"
            echo "  $0 --project <slug>             Target specific project"
            echo "  $0 --help                       This help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo ""
echo -e "${PURPLE}================================================================${NC}"
echo -e "${PURPLE}  PHOENIX PROTOCOL — Wave 25C Autonomous Recovery              ${NC}"
echo -e "${PURPLE}  Target: $PROJECT_SLUG                                        ${NC}"
echo -e "${PURPLE}================================================================${NC}"
echo ""

# Phase 1: Diagnose
diagnose
diag_result=$?

if [[ $diag_result -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}All systems nominal. Phoenix Protocol not needed.${NC}"
    exit 0
fi

if [[ "$DIAGNOSE_ONLY" == "true" ]]; then
    echo ""
    echo -e "${YELLOW}Diagnosis complete. Run without --diagnose-only to recover.${NC}"
    exit $diag_result
fi

# Phase 2: Drain
drain_retry_queue

# Phase 3: Restart
restart_services

# Phase 4: Verify
verify_recovery
verify_result=$?

# Phase 5: Log
log_recovery

echo ""
echo -e "${BLUE}================================================================${NC}"
if [[ $verify_result -eq 0 ]]; then
    echo -e "${GREEN}  PHOENIX PROTOCOL SUCCEEDED                                   ${NC}"
else
    echo -e "${RED}  PHOENIX PROTOCOL NEEDS MANUAL INTERVENTION                   ${NC}"
fi
echo -e "${BLUE}================================================================${NC}"
echo ""
echo -e "Log: ${CYAN}$PHOENIX_LOG${NC}"

exit $verify_result
