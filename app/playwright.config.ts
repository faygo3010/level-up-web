import { defineConfig, devices } from '@playwright/test'

const PORT = 4174

/**
 * End-to-end suite for the Level Up PWA. Builds the production bundle and
 * serves it with `vite preview`, then drives it in a phone and a desktop
 * Chromium. Specs are named *.e2e.ts so Vitest's default glob never picks them up.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './e2e/.results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: './e2e/.report', open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The production build registers a service worker; keep every test on fresh network responses.
    serviceWorkers: 'block',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  },
  projects: [
    // iPhone 13 viewport, touch and UA, rendered in Chromium (the browser installed here).
    { name: 'iphone-13', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
