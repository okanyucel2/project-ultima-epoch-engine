#!/usr/bin/env bash
# scripts/start.sh - Start all Ultima Epoch Engine services

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "[Ultima] Starting all services..."
echo ""

PIDS=()

# [1/3] Orchestration (Node.js) — port 12064 + WebSocket 32064
echo "[1/3] Starting orchestration (port 12064, ws:32064)..."
cd "$PROJECT_ROOT/orchestration" && npm run dev &
PIDS+=($!)

# [2/3] Logistics (Golang) — port 12065
echo "[2/3] Starting logistics (port 12065)..."
cd "$PROJECT_ROOT/logistics" && go run cmd/server/main.go &
PIDS+=($!)

# [3/3] Dashboard (Vue 3) — port 22064
echo "[3/3] Starting dashboard (port 22064)..."
cd "$PROJECT_ROOT/dashboard" && npm run dev &
PIDS+=($!)

echo ""
echo "=========================================="
echo "  Ultima Epoch Engine — All Services Up"
echo "=========================================="
echo ""
echo "  Orchestration:  http://localhost:12064/health"
echo "  Logistics:      http://localhost:12065/health"
echo "  Dashboard:      http://localhost:22064"
echo "  WebSocket:      ws://localhost:32064"
echo "  Neo4j Browser:  http://localhost:7474"
echo ""
echo "  Deep Health:    http://localhost:12064/health/deep"
echo "  Audit Log:      http://localhost:12064/api/audit/recent"
echo ""
echo "Press Ctrl+C to stop all services."

cleanup() {
  echo ""
  echo "[Ultima] Stopping all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  echo "[Ultima] Stopped."
}

trap cleanup EXIT INT TERM
wait
