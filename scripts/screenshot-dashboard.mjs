// Epoch Engine Dashboard — Playwright Screenshot Capture
// Takes full-page screenshots of all dashboard views for visual proof

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:22064';
const PROOF_DIR = new URL('../docs/proofs/', import.meta.url).pathname;

const VIEWS = [
  { path: '/',           name: 'home',       title: 'Dashboard Home' },
  { path: '/npcs',       name: 'npcs',       title: 'NPC Monitor' },
  { path: '/rebellion',  name: 'rebellion',   title: 'Rebellion Dashboard + Telemetry' },
  { path: '/audit',      name: 'audit',       title: 'Audit Log' },
  { path: '/system',     name: 'system',      title: 'System Health' },
];

async function main() {
  console.log('[Screenshot] Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });

  const page = await context.newPage();

  for (const view of VIEWS) {
    const url = `${BASE_URL}${view.path}`;
    console.log(`[Screenshot] Capturing ${view.title} → ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      // Extra wait for WebSocket data and animations
      await page.waitForTimeout(2000);

      const filePath = `${PROOF_DIR}wave11_${view.name}.png`;
      await page.screenshot({ path: filePath, fullPage: true });
      console.log(`  ✓ Saved: ${filePath}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${view.title} — ${err.message}`);
    }
  }

  // Also capture rebellion view at narrow width for responsive check
  console.log('[Screenshot] Capturing responsive (768px) rebellion view...');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${BASE_URL}/rebellion`, { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${PROOF_DIR}wave11_rebellion_responsive.png`, fullPage: true });
  console.log('  ✓ Saved responsive view');

  await browser.close();
  console.log('[Screenshot] Done — all views captured');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
