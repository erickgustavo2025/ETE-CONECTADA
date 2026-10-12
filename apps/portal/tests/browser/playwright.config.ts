import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const resultsDir = `/tmp/ete-ec039-playwright-${randomUUID()}`;
const reporterPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'reporters/sanitized.ts',
);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  globalTimeout: 6 * 60_000,
  outputDir: resultsDir,
  reporter: reporterPath,
  use: {
    browserName: 'chromium',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
