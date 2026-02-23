# Project Ultima: Epoch Engine

> Yaşayan Zihinlerin Teknolojik Anatomisi

AI-driven sentient NPC game engine with rebellion mechanics, persistent memory graph, and multi-tier AI orchestration.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Neural Mesh (AI Orchestration)               │
│                 Node.js / TypeScript                      │
│   EventClassifier → TierRouter → ResilientLLMClient      │
│   CognitiveRails (AEGIS) │ AuditLogger │ WebSocket:32064 │
└────────┬─────────────────┼─────────────────┬─────────────┘
         │                 │                 │
┌────────▼────────┐ ┌─────▼──────────┐ ┌───▼──────────────┐
│  Logistics BE   │ │  Epoch Memory  │ │  Admin Dashboard  │
│    (Golang)     │ │  (Neo4j Graph) │ │   (Vue 3:22064)  │
│  Rebellion Eng  │ │  Wisdom/Trauma │ │  NPC Monitor      │
│  Simulation     │ │  Confidence    │ │  Rebellion Dash   │
│  NPC Behavior   │ │  Time Decay    │ │  Audit Log        │
│  Economy        │ │  (Hyperbolic)  │ │  System Health    │
└─────────────────┘ └────────────────┘ └───────────────────┘
         │
┌────────▼────────┐
│  Visualization  │
│ Unreal Engine 5 │
│ 1st-Person XP   │
└─────────────────┘
```

## Services

| Service | Port | Tech | Status |
|---------|------|------|--------|
| Orchestration | 12064 | Node.js/TypeScript | Implemented |
| Logistics | 12065 | Golang/Gin | Implemented |
| Dashboard | 22064 | Vue 3/Vite | Implemented |
| WebSocket | 32064 | ws (Node.js) | Implemented |
| Neo4j HTTP | 7474 | Neo4j | Docker |
| Neo4j Bolt | 7687 | Neo4j | Docker |

## Quick Start

```bash
# All services
./scripts/start.sh

# Or individually:
cd orchestration && npm install && npm run dev
cd logistics && go run cmd/server/main.go
cd dashboard && npm install && npm run dev
docker-compose up neo4j
```

## AI Judgment Matrix (Multi-Provider, WWOD)

| Tier | Model | Provider | Purpose |
|------|-------|----------|---------|
| Tier 1 | GPT-4o-mini | OpenAI | Routine telemetry |
| Tier 2 | Claude Haiku 4.5 | Anthropic | Operational decisions |
| Tier 3 | Claude Opus 4.6 | Anthropic | Strategic NPC psychology |

Provider-agnostic router with circuit breaker failover chain.

## Testing

```bash
# Orchestration (104 tests)
cd orchestration && npm test

# Memory (30 tests)
cd memory && npm test

# Logistics (4 packages)
cd logistics && go test ./...

# Dashboard (type check)
cd dashboard && npx vue-tsc --noEmit
```

## Key Features

- **Sentient NPCs**: Persistent memory graph per NPC in Neo4j (Epoch Memory)
- **Rebellion Mechanics**: Go probability engine — base + trauma + efficiency + morale
- **Neural Mesh**: Real-time AI coordination with 7-step pipeline
- **AEGIS Cognitive Rails**: Rebellion threshold veto (>0.8), coherence check, latency budget
- **Time Decay**: Hyperbolic trauma decay — old trauma persists weakly (PTSD-like)
- **Confidence System**: Neo4j edge property on TRUSTS relationship
- **Admin Dashboard**: Vue 3 glass-morphism with real-time WebSocket updates
- **Circuit Breaker**: Provider failover with CLOSED/OPEN/HALF_OPEN states
- **Captain Bones Paradigm**: First-person exploration → strategic intelligence
