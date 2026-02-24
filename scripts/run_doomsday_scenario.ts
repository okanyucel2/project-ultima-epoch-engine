#!/usr/bin/env -S npx tsx
// =============================================================================
// DOOMSDAY SCENARIO RUNNER — Thin wrapper
//
// Delegates to packages/engine-bridge/scripts/run-doomsday.ts
// Run from project root: npx tsx scripts/run_doomsday_scenario.ts
// Or directly:            npx tsx packages/engine-bridge/scripts/run-doomsday.ts
// =============================================================================

import { execSync } from 'child_process';
import { dirname, resolve } from 'path';

const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const script = resolve(projectRoot, 'packages/engine-bridge/scripts/run-doomsday.ts');

execSync(`npx tsx "${script}"`, { stdio: 'inherit', cwd: projectRoot });
