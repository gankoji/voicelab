import { defineConfig, devices } from '@playwright/test';

// Layout/loading smoke across engines. Microphone capture tests are Chromium-only
// (the fake-audio flags are Chromium-specific), so this runs only app.spec.ts.
export default defineConfig({
  testDir: './tests/browser',
  testMatch: /app\.spec\.ts/,
  forbidOnly: true,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});