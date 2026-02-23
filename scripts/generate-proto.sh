#!/usr/bin/env bash
set -euo pipefail

# Epoch Engine — Proto Code Generation
# Generates TypeScript (orchestration) and Go (logistics) stubs from proto definitions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROTO_DIR="$PROJECT_ROOT/shared/proto"

echo "[Proto] Generating code from $PROTO_DIR"

# Ensure output directories exist
mkdir -p "$PROJECT_ROOT/orchestration/src/generated"
mkdir -p "$PROJECT_ROOT/logistics/internal/generated"

# Check for buf
if command -v buf &> /dev/null; then
  echo "[Proto] Using buf for code generation"
  cd "$PROTO_DIR"
  buf generate
  echo "[Proto] Generation complete via buf"
else
  echo "[Proto] buf not found. Install: https://buf.build/docs/installation"
  echo "[Proto] Falling back to protoc..."

  # Fallback to protoc
  if ! command -v protoc &> /dev/null; then
    echo "[Proto] ERROR: Neither buf nor protoc found. Install one of them."
    exit 1
  fi

  # TypeScript generation
  echo "[Proto] Generating TypeScript stubs..."
  protoc \
    --plugin=protoc-gen-ts_proto="$(npx which ts-proto)" \
    --ts_proto_out="$PROJECT_ROOT/orchestration/src/generated" \
    --ts_proto_opt=esModuleInterop=true,outputServices=grpc-js,env=node \
    -I "$PROTO_DIR" \
    "$PROTO_DIR"/*.proto

  # Go generation
  echo "[Proto] Generating Go stubs..."
  protoc \
    --go_out="$PROJECT_ROOT/logistics/internal/generated" \
    --go_opt=paths=source_relative \
    --go-grpc_out="$PROJECT_ROOT/logistics/internal/generated" \
    --go-grpc_opt=paths=source_relative \
    -I "$PROTO_DIR" \
    "$PROTO_DIR"/*.proto

  echo "[Proto] Generation complete via protoc"
fi

echo "[Proto] Output:"
echo "  TypeScript: $PROJECT_ROOT/orchestration/src/generated/"
echo "  Go:         $PROJECT_ROOT/logistics/internal/generated/"
