# CLAUDE.md — Project Ultima: Epoch Engine

## Agent Identity
Agent: `project-ultima-epoch-engine-worker`

---

## Project Overview

**Project Ultima: Epoch Engine** — Yaşayan Zihinlerin Teknolojik Anatomisi

AI-driven sentient NPC game engine. NPCs have persistent memory (Neo4j graph),
rebellion mechanics, and psychological profiles. AEGIS supervisor prevents hallucinations
via Cognitive Rails.

**Architecture:** Neural Mesh orchestration → Golang logistics → Neo4j memory → UE5 visualization

---

## Port Allocation

| Service | Port |
|---------|------|
| Orchestration (Node.js/TS) | 12064 |
| Logistics (Golang) | 12065 |
| WebSocket | 32064 |
| Neo4j HTTP | 7474 |
| Neo4j Bolt | 7687 |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| AI Orchestration | Node.js / TypeScript |
| Logistics Backend | Golang |
| Memory Graph | Neo4j |
| Visualization | Unreal Engine 5 (separate) |
| Supervisor | AEGIS (from genesis-core) |

---

## AI Judgment Matrix (P0.78)

| Tier | Model | Scope |
|------|-------|-------|
| Tier 1 (Feed) | GPT-4o-mini | Routine telemetry, system metrics |
| Tier 2 (Vatımlı) | claude-haiku-4-5 | Operational decisions, resource management |
| Tier 3 (Complex) | claude-opus-4-6 | Strategic planning, NPC psychology synthesis |

---

## Onboarding (SSOT — Mandatory for New Agents)

**HARD RULE:** Before starting any work, read the Architecture Visual Index:
- **[`docs/architecture/ARCHITECTURE_VISUAL_INDEX.md`](docs/architecture/ARCHITECTURE_VISUAL_INDEX.md)** — Single Source of Truth
- Covers: Universal Engine Bridge, 3-Layer Resilience, Self-Healing Process Manager
- Text-based descriptions with direct code-file mappings (agent-readable, no images required)

---

## Key Concepts

### Captain Bones Paradigm
1. First-person exploration data collected
2. → Transferred to Strategic Intelligence Management
3. NPC decisions based on accumulated memory graph

### Rebellion Mechanics
- LLM mathematical commands to NPCs:
  - Work Efficiency: -30% → triggers rebellion consideration
  - Rebellion Probability: +30% → AEGIS intercepts if risk > threshold
- Golang backend: rebellion probability -30% = process halt

### Cognitive Rails
- AI creativity locked to game mechanics
- Hallucinations blocked by AEGIS Cognitive Rails
- 0ms latency monitoring, Veto Protocol for risky states

---

## Commands

```bash
# Orchestration (Node.js)
cd orchestration && npm run dev

# Logistics (Golang)
cd logistics && go run cmd/server/main.go

# Neo4j (Docker)
docker-compose up neo4j

# All services
./scripts/start.sh
```

---

## Inherited Protocols (from genesis-core)

- P0.40: TDD — No .ts/.go edits without test coverage
- P0.47: Pre-Commit Verification
- P0.50: Destructive Action Guard
- P0.70: #WWOD — MVP reddedildi, en sağlam mimari
- P0.78: Judgment Matrix — model routing by complexity
- P0.99: Session Guard

---

## Key Files

| File | Purpose |
|------|---------|
| `orchestration/src/agents/` | AI agent implementations |
| `orchestration/src/neural-mesh/` | Neural Mesh coordination |
| `logistics/internal/rebellion/` | Rebellion probability engine |
| `logistics/internal/simulation/` | Resource simulation (Sim, Rapidlum, Mineral) |
| `memory/src/graph/` | Neo4j NPC memory graph |
| `memory/src/wisdom/` | Wisdom scoring system |
| `memory/src/trauma/` | Trauma/Confidence scoring |

---

*For detailed workflows, see genesis-core skills. This file = project-specific facts only.*
