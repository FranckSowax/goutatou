import { test, expect } from '@playwright/test'

// Garde-fou CSP : la politique n'est bloquante que sur /app et /admin. Une directive trop stricte
// s'y verrait immédiatement (Realtime wss, images Supabase Storage, export QR en blob:). Ce test
// échoue si le navigateur signale la moindre violation. À lancer contre un build de PRODUCTION
// (`next start`) : le mode dev assouplit la politique pour le HMR.
const PAGES = [
  '/app',
  '/app/commandes',
  '/app/menu',
  '/app/clients',
  '/app/fidelite', // export du QR de caisse en blob:
  '/app/marketing/qr', // QR opt-in
  '/app/reglages',
]

test.describe('CSP — aucune violation sur l’espace connecté', () => {
  for (const path of PAGES) {
    test(`${path} ne déclenche aucune violation CSP`, async ({ page }) => {
      const violations: string[] = []
      page.on('console', (msg) => {
        const text = msg.text()
        if (/content security policy/i.test(text)) violations.push(text)
      })
      // `securitypolicyviolation` couvre aussi les blocages sans message console.
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          // eslint-disable-next-line no-console
          console.error(
            `Content Security Policy violation: ${e.violatedDirective} → ${e.blockedURI}`,
          )
        })
      })

      await page.goto(path, { waitUntil: 'networkidle' })
      await expect(page.locator('main')).toBeVisible()
      expect(violations, `Violations CSP sur ${path} :\n${violations.join('\n')}`).toEqual([])
    })
  }
})
