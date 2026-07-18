import { defineConfig, devices } from '@playwright/test'

/**
 * Tests end-to-end (navigateur réel) — séparés des tests unitaires Vitest (`test/`, exécutés par
 * `pnpm test`). Playwright ne scanne que `e2e/`. Le serveur Next de dev est démarré automatiquement
 * (réutilisé s'il tourne déjà) ; il lit `.env.local` comme en dev.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Port dédié (3000 peut être occupé par un autre projet local).
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
