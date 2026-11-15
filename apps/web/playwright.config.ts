// Playwright configuration for the end to end test of the learner path.
//
// The test does not start the app. It runs against a server that is already
// up: the dev server in Postgres mode locally, the Docker stack in CI.
// E2E_BASE_URL says where that server is. See "End to end test" in README.md.
import { defineConfig, devices } from '@playwright/test';

const inCi = process.env.CI !== undefined && process.env.CI !== '';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  // One learner path, one worker. The steps build on each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  // A whole lesson of twelve exercises, on a dev server that compiles each
  // route on its first request.
  timeout: 180_000,
  expect: { timeout: 15_000, toPass: { timeout: 30_000 } },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
