import { defineConfig, devices, type Project } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Charge les identifiants e2e depuis un fichier gitignoré `apps/web/.env.e2e` (KEY=VALUE), s'il
// existe, sans dépendance externe. Y placer E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD (compte patron
// dédié aux tests) pour activer les tests des pages connectées. On peut aussi passer ces variables
// en ligne : `E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… pnpm test:e2e`.
const envFile = path.join(__dirname, '.env.e2e')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const hasOwnerCreds = !!(process.env.E2E_OWNER_EMAIL && process.env.E2E_OWNER_PASSWORD)

// Projet non authentifié : pages publiques + gardes (ignore les specs connectées).
const baseProjects: Project[] = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
    testIgnore: /app-pages\.spec\.ts/,
  },
]

// N'ajoute la connexion + le projet authentifié que si les identifiants sont fournis.
const authProjects: Project[] = hasOwnerCreds
  ? [
      { name: 'setup', testMatch: /auth\.setup\.ts/ },
      {
        name: 'authenticated',
        testMatch: /app-pages\.spec\.ts/,
        use: { ...devices['Desktop Chrome'], storageState: path.join(__dirname, 'e2e', '.auth', 'owner.json') },
        dependencies: ['setup'],
      },
    ]
  : []

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
  projects: [...baseProjects, ...authProjects],
  webServer: {
    command: 'pnpm dev --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
