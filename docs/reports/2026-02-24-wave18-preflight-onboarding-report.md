# Wave 18: PM Refactor — Otonom Onboarding Architect

**Date:** 2026-02-24
**Phase:** 18A + 18B + 18C (single wave delivery)
**Agent:** MAX (project-ultima-epoch-engine-worker)

---

## Summary

Transformed the GENESIS Process Manager from a "process supervisor" into an "Onboarding Architect" that autonomously validates system requirements, bootstraps dependencies, manages environment files, and reports missing tools with install hints — before starting any service.

---

## What Changed

### 1. `genesis.yaml` — New `preflight:` section (+35 lines)

Added top-level `preflight:` key with three sub-sections:

- **requirements**: node (>=20.0.0), go (>=1.24.0), docker (required), buf (optional)
- **env**: Template copy (`orchestration/.env.example` → `.env`), critical var validation (`ANTHROPIC_API_KEY`)
- **dependencies**: Auto-bootstrap for 4 Node packages (npm), 1 Go module, proto stubs

### 2. `genesis_process.sh` — Utility functions + `preflight_project()` (+280 lines)

| Function | Purpose | Lines |
|----------|---------|-------|
| `version_gte()` | Semver comparison via Python | ~12 |
| `preflight_check_tool()` | Tool existence + version check with install hints | ~40 |
| `detect_package_manager()` | Lock file detection (npm/pnpm/yarn) | ~10 |
| `preflight_project()` | 5-phase main function (parse → requirements → env → deps → summary) | ~200 |

**Phase breakdown:**
1. Parse `preflight:` from YAML (fallback: auto-detect from service commands)
2. System requirements — iterate tools, check versions, report install hints
3. Environment — copy `.env.example` → `.env`, validate critical vars with masking
4. Dependencies — auto `npm install`, `go mod tidy`, proto stub generation
5. Summary — pass/fail with counts

**Integration points:**
- `cmd_restart()` now calls `preflight_project()` before starting services
- New `preflight` CLI command for standalone diagnostics
- `print_usage()` updated with preflight entry

### 3. `pm.sh` — New `preflight` subcommand (+15 lines)

Auto-detects project from CWD or accepts explicit slug argument.

---

## Test Results

### Full preflight (Epoch Engine)

```
PRE-FLIGHT: project-ultima-epoch-engine
  Checking system requirements...
  [✓] node 22.14.0 (>= 20.0.0)
  [✓] go 1.26.0 (>= 1.24.0)
  [✓] docker found (29.2.1)
  [!] OPTIONAL: buf not found (non-critical)
  Checking environment...
  [✓] orchestration/.env exists
  [✓] ANTHROPIC_API_KEY set (sk-ant-a...)
  Checking dependencies (auto_bootstrap=True)...
  [✓] orchestration/node_modules present
  [✓] dashboard/node_modules present
  [✓] shared/node_modules present
  [✓] memory/node_modules present
  [✓] logistics/go.sum present
  [✓] Proto stubs present in orchestration/src/generated
  Pre-flight PASSED (1 warning)
```

### Backward compatibility (project without `preflight:`)

```
PRE-FLIGHT: genesis-bigr-discovery
  No preflight: section — auto-detecting requirements...
  [✓] node found (22.14.0)
  Pre-flight passed (auto-detect mode, 0 warnings)
```

### Auto-copy verification

On first run, `.env.example` was automatically copied to `.env` with warning:
```
[!] Created orchestration/.env from .env.example — REVIEW and fill in real values
```

---

## File Inventory

| # | File | Action | Lines Changed |
|---|------|--------|---------------|
| 1 | `projects/project-ultima-epoch-engine/genesis.yaml` | MODIFIED | +35 |
| 2 | `scripts/genesis_process.sh` | MODIFIED | +280 |
| 3 | `scripts/pm.sh` | MODIFIED | +17 |

**Total: 3 files modified, ~332 lines added**

---

## Verification Checklist

- [x] `genesis_process.sh preflight --project project-ultima-epoch-engine` — all green
- [x] `pm.sh preflight` from project CWD — auto-detects project
- [x] `pm.sh preflight project-ultima-epoch-engine` — explicit slug
- [x] Backward compat: project without `preflight:` → auto-detect mode passes
- [x] `.env.example` auto-copy → works, with review warning
- [x] Optional tool (buf) → warning, not failure
- [x] Required tool version check → semver comparison works
- [x] Critical var masking → shows `sk-ant-a...`
- [x] Package manager detection → npm detected (package-lock.json)

---

## Architecture Notes

- **No new dependencies**: Uses only bash, Python stdlib, and existing `yaml` module
- **Idempotent**: Safe to run multiple times (skips `.env` copy if exists, skips install if `node_modules` present)
- **Fail-fast**: Critical failures (missing required tools) abort restart with clear error
- **Non-blocking warnings**: Optional tools, direnv hints, and review notices don't prevent startup
- **Auto-detect fallback**: Projects without `preflight:` still get basic requirement scanning
