import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
