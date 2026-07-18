import { test, expect } from '@playwright/test'

// Vue employé (rôle staff) : nav restreinte + gating serveur des pages patron. Session employé
// (projet « staff »). Un employé ne doit voir/atteindre que l'opérationnel.
test.describe('Vue employé', () => {
  const OWNER_ONLY_PATHS = ['/app/reglages', '/app/stats', '/app/analyses', '/app/marketing', '/app/equipe']
  const STAFF_PATHS = ['/app', '/app/commandes', '/app/menu', '/app/clients', '/app/fidelite', '/app/conversations']

  test('la nav masque les entrées réservées au patron', async ({ page }) => {
    await page.goto('/app', { waitUntil: 'networkidle' })
    const nav = page.getByRole('navigation')
    // Présentes pour l'employé.
    await expect(nav.getByRole('link', { name: 'Commandes' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Clients' })).toBeVisible()
    // Masquées (réservées patron).
    await expect(nav.getByRole('link', { name: 'Réglages' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Analyses' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Marketing' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Statistiques' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Équipe' })).toHaveCount(0)
  })

  for (const path of OWNER_ONLY_PATHS) {
    test(`${path} redirige l’employé vers /app`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' })
      // Gating serveur : renvoyé vers /app (connecté), pas vers /login ni sur la page patron.
      await expect(page).toHaveURL(/\/app$/)
    })
  }

  for (const path of STAFF_PATHS) {
    test(`${path} reste accessible à l’employé`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' })
      await expect(page).not.toHaveURL(/\/login/)
      await expect(page.locator('main')).toBeVisible()
      await expect(page.getByText('Application error')).toHaveCount(0)
    })
  }
})
