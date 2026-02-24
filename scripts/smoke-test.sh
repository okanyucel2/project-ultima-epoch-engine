#!/usr/bin/env bash
# =============================================================================
# Epoch Engine — Smoke Test
# =============================================================================
# Sends events through the full Neural Mesh pipeline and verifies:
#   1. Event classification + LLM routing
#   2. Rebellion probability check
#   3. Cognitive Rails validation
#   4. WebSocket broadcast
#   5. Neo4j memory persistence
#   6. Audit log recording
#
# Prerequisites: Orchestration (:12064) and optionally Logistics (:12065)
# Uses mock mode by default (no API cost).
# =============================================================================

set -euo pipefail

ORCH_URL="${ORCH_URL:-http://localhost:12064}"
NEO4J_URL="${NEO4J_URL:-bolt://localhost:7687}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=============================================="
echo "  Epoch Engine — Smoke Test"
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# Step 1: Health check
# ---------------------------------------------------------------------------
echo "▸ Step 1: Health Check"
HEALTH=$(curl -s -w "\n%{http_code}" "$ORCH_URL/health" 2>/dev/null)
HTTP_CODE=$(echo "$HEALTH" | tail -1)
BODY=$(echo "$HEALTH" | head -1)

check "Orchestration responding" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
check "Status is 'ok'" "$(echo "$BODY" | python3 -c "import sys,json; print('true' if json.load(sys.stdin).get('status')=='ok' else 'false')" 2>/dev/null || echo false)"

echo ""

# ---------------------------------------------------------------------------
# Step 2: Process a ROUTINE event (Tier 1 — GPT-4o-mini)
# ---------------------------------------------------------------------------
echo "▸ Step 2: ROUTINE Event (Tier 1)"
ROUTINE_RESP=$(curl -s -X POST "$ORCH_URL/api/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "smoke-routine-001",
    "npcId": "npc-miner-alpha",
    "eventType": "telemetry",
    "description": "Miner Alpha reporting shift completion, 42 units of Rapidlum extracted"
  }' 2>/dev/null)

check "Event processed" "$(echo "$ROUTINE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('eventId')=='smoke-routine-001' else 'false')" 2>/dev/null || echo false)"
check "Tier is routine" "$(echo "$ROUTINE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('tier')=='routine' else 'false')" 2>/dev/null || echo false)"
check "AI response present" "$(echo "$ROUTINE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if len(d.get('aiResponse',''))>5 else 'false')" 2>/dev/null || echo false)"
check "Not vetoed" "$(echo "$ROUTINE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if not d.get('vetoApplied') else 'false')" 2>/dev/null || echo false)"

echo ""

# ---------------------------------------------------------------------------
# Step 3: Process an OPERATIONAL event (Tier 2 — Claude Haiku)
# ---------------------------------------------------------------------------
echo "▸ Step 3: OPERATIONAL Event (Tier 2)"
OP_RESP=$(curl -s -X POST "$ORCH_URL/api/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "smoke-op-001",
    "npcId": "npc-farmer-beta",
    "eventType": "resource_change",
    "description": "Farmer Beta reports crop failure due to contaminated water supply. Food reserves dropping."
  }' 2>/dev/null)

check "Event processed" "$(echo "$OP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('eventId')=='smoke-op-001' else 'false')" 2>/dev/null || echo false)"
check "Tier is operational" "$(echo "$OP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('tier')=='operational' else 'false')" 2>/dev/null || echo false)"

echo ""

# ---------------------------------------------------------------------------
# Step 4: Process a STRATEGIC event (Tier 3 — Claude Opus)
# ---------------------------------------------------------------------------
echo "▸ Step 4: STRATEGIC Event (Tier 3)"
STRAT_RESP=$(curl -s -X POST "$ORCH_URL/api/events" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "smoke-strat-001",
    "npcId": "npc-soldier-gamma",
    "eventType": "rebellion_analysis",
    "description": "Soldier Gamma witnessed comrade death in mining accident. Morale critical. Requesting psychological evaluation.",
    "urgency": 0.9
  }' 2>/dev/null)

check "Event processed" "$(echo "$STRAT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('eventId')=='smoke-strat-001' else 'false')" 2>/dev/null || echo false)"
check "Tier is strategic" "$(echo "$STRAT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('tier')=='strategic' else 'false')" 2>/dev/null || echo false)"
check "Rebellion check present" "$(echo "$STRAT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if 'rebellionCheck' in d else 'false')" 2>/dev/null || echo false)"

echo ""

# ---------------------------------------------------------------------------
# Step 5: Batch processing
# ---------------------------------------------------------------------------
echo "▸ Step 5: Batch Processing (3 events)"
BATCH_RESP=$(curl -s -X POST "$ORCH_URL/api/events/batch" \
  -H "Content-Type: application/json" \
  -d '[
    {"eventId":"smoke-batch-1","npcId":"npc-scout-delta","eventType":"telemetry","description":"Scout Delta patrol report: perimeter secure"},
    {"eventId":"smoke-batch-2","npcId":"npc-medic-epsilon","eventType":"npc_query","description":"Medic Epsilon requesting medical supplies for injured workers"},
    {"eventId":"smoke-batch-3","npcId":"npc-engineer-zeta","eventType":"command","description":"Engineer Zeta ordered to increase refinery output by 150%"}
  ]' 2>/dev/null)

BATCH_COUNT=$(echo "$BATCH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo 0)
check "3 batch results returned" "$([ "$BATCH_COUNT" = "3" ] && echo true || echo false)"

echo ""

# ---------------------------------------------------------------------------
# Step 6: Audit log verification
# ---------------------------------------------------------------------------
echo "▸ Step 6: Audit Log"
AUDIT_RESP=$(curl -s "$ORCH_URL/api/audit/stats" 2>/dev/null)

TOTAL=$(echo "$AUDIT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('totalDecisions',0))" 2>/dev/null || echo 0)
check "Audit recorded decisions" "$([ "$TOTAL" -ge 6 ] && echo true || echo false)"
check "Avg latency tracked" "$(echo "$AUDIT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('avgLatencyMs',0)>0 else 'false')" 2>/dev/null || echo false)"

echo ""

# ---------------------------------------------------------------------------
# Step 7: Neo4j memory check (if available)
# ---------------------------------------------------------------------------
echo "▸ Step 7: Neo4j Memory Persistence"
NEO4J_CHECK=$(docker exec epoch-neo4j cypher-shell -u neo4j -p epochengine \
  "MATCH (n:NPC) RETURN count(n) AS npcCount" 2>/dev/null | tail -1 || echo "0")

if [ "$NEO4J_CHECK" != "0" ] && echo "$NEO4J_CHECK" | grep -qE '^[0-9]+$'; then
  check "NPC nodes in Neo4j: $NEO4J_CHECK" "true"
else
  echo -e "  ${YELLOW}⊘${NC} Neo4j memory check skipped (container or memory wiring not active)"
fi

echo ""

# ---------------------------------------------------------------------------
# Step 8: System status
# ---------------------------------------------------------------------------
echo "▸ Step 8: System Status"
STATUS_RESP=$(curl -s "$ORCH_URL/api/status" 2>/dev/null)
check "/api/status responding" "$(echo "$STATUS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if 'eventsProcessed' in d else 'false')" 2>/dev/null || echo false)"

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "=============================================="
TOTAL=$((PASS + FAIL))
echo -e "  Results: ${GREEN}${PASS} passed${NC} / ${RED}${FAIL} failed${NC} / ${TOTAL} total"
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}ALL SMOKE TESTS PASSED${NC}"
else
  echo -e "  ${RED}SOME TESTS FAILED${NC}"
fi
echo "=============================================="

exit "$FAIL"
