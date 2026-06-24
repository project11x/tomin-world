import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /^(?!\._).*\.spec\.js$/,
  testIgnore: ['**/._*'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Retry only in CI: the suite has animation-timed UI assertions that flake
  // on slower CI runners. A real failure still fails all attempts; this only
  // absorbs timing variance. Local runs stay at 0 to surface flakiness.
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx http-server . -c-1 -p 8080 --silent',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
