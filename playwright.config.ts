import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 45000,
  expect: {
    timeout: 8000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'tsx apps/api/src/server.ts',
    url: 'http://127.0.0.1:3000/health',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      MONGODB_DB: 'crewgrid_e2e',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/crewgrid_e2e?replicaSet=rs0&directConnection=true',
      APP_ORIGIN: 'http://127.0.0.1:3000'
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});

