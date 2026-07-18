import { test, expect } from '@playwright/test'

// Pages publiques (sans authentification). On vérifie qu'elles se rendent sans page d'erreur
// Next et affichent leur contenu clé. Les pages qui dépendent de la base lisent `.env.local`
// via le serveur de dev.

test.describe('Pages publiques', () => {
  test('/ redirige vers /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
  })

  test('/login — connexion', async ({ page }) => {
    const res = await page.goto('/login')
    expect(res?.status()).toBeLessThan(400)
    await expect(page.getByRole('heading', { name: 'Goutatou' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Patron' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Employé' })).toBeVisible()
  })

  test('/login/mot-de-passe-oublie', async ({ page }) => {
    const res = await page.goto('/login/mot-de-passe-oublie')
    expect(res?.status()).toBeLessThan(400)
    await expect(page.locator('form')).toBeVisible()
  })

  test('/login/definir-mot-de-passe', async ({ page }) => {
    const res = await page.goto('/login/definir-mot-de-passe')
    expect(res?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toBeVisible()
  })

  // Ces pages lisent la base via le client service_role. Sans SUPABASE_SERVICE_ROLE_KEY en local
  // (secret non commité), on les saute proprement : elles sont couvertes en prod (Netlify a la clé)
  // ou en local en ajoutant la clé à .env.local.
  const needsServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  test('/r/chez-demo — landing page publique', async ({ page }) => {
    test.skip(!needsServiceRole, 'SUPABASE_SERVICE_ROLE_KEY requis')
    const res = await page.goto('/r/chez-demo')
    expect(res?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toBeVisible()
    // Pas d'overlay d'erreur Next.
    await expect(page.getByText('Application error')).toHaveCount(0)
  })

  test('/f/[token] invalide → lien invalide', async ({ page }) => {
    const res = await page.goto('/f/jeton-bidon')
    expect(res?.status()).toBeLessThan(500)
    await expect(page.getByText(/invalide/i)).toBeVisible()
  })

  test('/f/s/[code] inconnu → indisponible', async ({ page }) => {
    test.skip(!needsServiceRole, 'SUPABASE_SERVICE_ROLE_KEY requis')
    const res = await page.goto('/f/s/code-inexistant')
    expect(res?.status()).toBeLessThan(500)
    await expect(page.getByText('Carte de fidélité indisponible.')).toBeVisible()
  })
})
