# Epic Roadmap — The Neural Citadel (Ecosystem Scaling)

**Vision:** Epoch Engine'den tek-kiracı (single-tenant) bir oyun motorundan, birden fazla
bağımsız dünyayı barındıran bir **Çoklu-Kiracı Ana Gemi**'ye (Multi-Tenant Mothership)
evrilme. Bu roadmap, Season 3+ için stratejik backlog kaydıdır.

**Status:** BACKLOG (aktif geliştirme yok — vizyon belgesi)
**Filed by:** Okan (Yönetmen) + MAX (project-ultima-epoch-engine-worker)
**Date:** 2026-02-24

---

## 1. Multi-Tenant Neo4j Architecture

**Epic:** Tek Neo4j instance'ının birden fazla oyun dünyasını barındırması.

**Problem:** Mevcut mimari tek bir oyun dünyası varsayar. Her NPC, Memory, TRUSTS
ilişkisi global namespace'te yaşar. İkinci bir dünya eklendiğinde graph collision kaçınılmaz.

**Hedef:**
- Namespace isolation: Her dünya (tenant) kendi graph partition'ına sahip olur
- `worldId` label'ı tüm node/edge'lere eklenir: `(:NPC {id: "bones", worldId: "epoch-prime"})`
- ConnectionPool tenant-aware hale gelir — session başına world context
- RetryQueue tenant-bazlı kapasite yönetimi (world A'nın overflow'u world B'yi etkilemez)
- Wisdom/Trauma scoring per-world izolasyonu

**Teknik Not:**
- Neo4j Community Edition: Label-based soft isolation (mevcut driver ile uyumlu)
- Neo4j Enterprise: Native multi-database desteği (her world ayrı database)
- Migration path: Community → Enterprise, label-based → database-based

**Bağımlılıklar:**
- `memory/src/graph/connection-pool.ts` — tenant-aware session factory
- `memory/src/graph/retry-queue.ts` — per-tenant ring buffer partitioning
- `shared/types/common.ts` — `WorldId` type eklenmesi
- Tüm Cypher query'leri `WHERE worldId = $worldId` filtresi almalı

---

## 2. Global Neural Dispatcher (API Gateway)

**Epic:** Tüm Epoch Engine instance'larını tek bir giriş noktasından yöneten
merkezi bir API Gateway.

**Problem:** Her proje kendi orchestration portunu (12064) dinler. Birden fazla
dünya çalıştığında port çakışması, routing karmaşıklığı ve monitoring dağılması oluşur.

**Hedef:**
- Merkezi API Gateway: `gateway.epoch.local:8000` → route to world instances
- Request routing: `X-World-Id` header veya URL path (`/worlds/{worldId}/api/events`)
- Rate limiting per-world (fair scheduling, bir dünya tüm kaynağı tüketmesin)
- Unified health dashboard: Tüm dünyaların sağlık durumu tek ekranda
- WebSocket multiplexing: Tek WS bağlantısı, channel prefix ile world routing
  (`{worldId}:npc-events`, `{worldId}:rebellion-alerts`)

**Teknik Not:**
- İlk iterasyon: Node.js reverse proxy (http-proxy-middleware)
- Gelecek: Envoy/Traefik sidecar pattern
- EpochDispatcher zaten channel-based — `{worldId}:` prefix doğal uzantı

**Bağımlılıklar:**
- `orchestration/src/index.ts` — instance ID injection
- `packages/engine-bridge/src/dispatcher.ts` — world-prefixed channel support
- `dashboard/src/composables/useEpochWebSocket.ts` — multi-world subscription
- Yeni: `gateway/` dizini — proxy + routing logic

---

## 3. Cross-Pollination (Projeler Arası Olay Geçirgenliği)

**Epic:** Farklı dünyalardaki NPC'lerin birbirlerinin olaylarından dolaylı
olarak etkilenmesi — "Kelebek Etkisi" mekanizması.

**Problem:** Mevcut mimari dünyaları birbirinden tamamen izole eder.
Gerçek bir ekosistemde, bir dünyadaki büyük isyan diğer dünyalardaki NPC'lerin
"söylentiler duyması"na neden olmalı.

**Hedef:**
- Event propagation bus: Dünyalar arası olay yayılımı (configurable)
- Attenuation factor: Olay şiddeti mesafeyle (dünya farklılığıyla) azalır
  - Aynı dünya: 1.0x (tam etki)
  - Komşu dünya: 0.3x (söylenti)
  - Uzak dünya: 0.05x (belirsiz his)
- AEGIS Cross-World veto: Bir dünyadaki isyan, diğer dünyaları domine edemez
- Event types: Sadece `rebellion-alerts` ve `telemetry` (catastrophic) geçirgen
  - `npc-events`: Geçirgen DEĞİL (kişisel, dünya-spesifik)
  - `simulation-ticks`: Geçirgen DEĞİL (dünya ekonomisi izole)

**Teknik Not:**
- Redis Pub/Sub veya NATS JetStream inter-world event bus
- Attenuation hesaplaması Logistics (Go) tarafında — rebellion probability
  modifikasyonu mevcut formüle `crossWorldRumor` parametresi eklenir
- Neo4j cross-world edge: `(:World {id: "A"})-[:RUMOR_OF {attenuation: 0.3}]->(:Event)`

**Bağımlılıklar:**
- Epic 1 (Multi-Tenant) MUST tamamlanmadan başlanamaz
- Epic 2 (Gateway) SHOULD tamamlanmış olmalı (routing altyapısı)
- `logistics/internal/rebellion/` — `crossWorldRumor` faktörü
- Yeni: `shared/types/cross-pollination.ts` — event propagation types

---

## Dependency Graph

```
Epic 1: Multi-Tenant Neo4j
  │
  ├──→ Epic 2: Global Neural Dispatcher
  │       │
  │       └──→ Epic 3: Cross-Pollination
  │                     (requires both 1 + 2)
  └──→ Epic 3
```

**Critical Path:** Epic 1 → Epic 2 → Epic 3 (sequential dependency)

---

## Priority & Timeline

| Epic | Priority | Estimated Complexity | P0.78 Score |
|------|----------|---------------------|-------------|
| Multi-Tenant Neo4j | P1 (Foundation) | High (50+ files) | 85 (Full orchestration) |
| Global Neural Dispatcher | P2 (Infrastructure) | Medium (20+ files) | 60 (Orchestrate 2-3 agents) |
| Cross-Pollination | P3 (Innovation) | High (30+ files) | 75 (Full orchestration) |

---

*This roadmap is a strategic backlog document. No implementation has started.
Activation requires Yönetmen (Director) approval per P0.50.*
