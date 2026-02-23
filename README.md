# Project Ultima: Epoch Engine

> Yaşayan Zihinlerin Teknolojik Anatomisi

AI-driven sentient NPC game engine with rebellion mechanics, persistent memory graph, and multi-tier AI orchestration.

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Neural Mesh (AI Orchestration)         │
│              Node.js / TypeScript                │
│         MAX Orchestrator — 63 MCP Tools          │
└────────────┬───────────────────────┬────────────┘
             │                       │
    ┌────────▼────────┐   ┌─────────▼─────────┐
    │  Logistics BE   │   │   Memory Graph     │
    │    (Golang)     │   │  (Neo4j + ExpDB)   │
    │  Refineries,    │   │  NPC Wisdom/Trauma │
    │  Mines, Economy │   │  Persistent Memory │
    └─────────────────┘   └────────────────────┘
             │
    ┌────────▼────────┐
    │  Visualization  │
    │ Unreal Engine 5 │
    │ 1st-Person XP   │
    └─────────────────┘
```

## Services

| Service | Port | Tech |
|---------|------|------|
| Orchestration | 12064 | Node.js/TypeScript |
| Logistics | 12065 | Golang |
| Neo4j HTTP | 7474 | Neo4j |
| Neo4j Bolt | 7687 | Neo4j |

## Quick Start

```bash
# Orchestration
cd orchestration && npm install && npm run dev

# Logistics
cd logistics && go run cmd/server/main.go

# Neo4j (Docker)
docker run -p 7474:7474 -p 7687:7687 neo4j:latest
```

## AI Judgment Matrix

| Tier | Model | Purpose |
|------|-------|---------|
| Tier 1 | GPT-4o-mini | Routine telemetry |
| Tier 2 | Claude Haiku 4.5 | Operational decisions |
| Tier 3 | Claude Opus 4.6 | Strategic NPC psychology |

## Key Features

- **Sentient NPCs**: Persistent memory graph per NPC in Neo4j
- **Rebellion Mechanics**: LLM-driven probability engine in Golang
- **Neural Mesh**: Real-time AI coordination via MAX orchestrator
- **AEGIS Supervisor**: Cognitive Rails preventing hallucinations
- **Captain Bones Paradigm**: First-person exploration → strategic intelligence
