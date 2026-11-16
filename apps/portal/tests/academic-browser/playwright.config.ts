import { defineConfig } from '@playwright/test';
import base from '../browser/playwright.config';
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'school-academic.spec.ts',
  globalTimeout: 600000,
});
