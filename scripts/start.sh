#!/usr/bin/env bash
# scripts/start.sh - Start all Ultima Epoch Engine services

set -euo pipefail

echo "[Ultima] Starting all services..."

# Orchestration (Node.js)
echo "[1/2] Starting orchestration (port 12064)..."
cd "$(dirname "$0")/../orchestration" && npm run dev &
ORCH_PID=$!

# Logistics (Golang)
echo "[2/2] Starting logistics (port 12065)..."
cd "$(dirname "$0")/../logistics" && go run cmd/server/main.go &
LOG_PID=$!

echo ""
echo "✓ Ultima Epoch Engine running"
echo "  Orchestration: http://localhost:12064/health"
echo "  Logistics:     http://localhost:12065/health"
echo "  Neo4j:         http://localhost:7474"
echo ""
echo "Press Ctrl+C to stop all services."

trap "kill $ORCH_PID $LOG_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
