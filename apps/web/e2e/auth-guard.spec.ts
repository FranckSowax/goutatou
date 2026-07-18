import { test, expect } from '@playwright/test'

// Toute route protégée (/app/*, /admin/*) doit rediriger vers /login pour un visiteur non
// authentifié. Ce test « touche » chaque page de l'espace connecté et vérifie la garde du
// middleware — sans identifiants ni données. Les routes dynamiques utilisent un id factice :
// la garde s'exécute avant le rendu de la page.
const PROTECTED_ROUTES = [
  '/app',
  '/app/analyses',
  '/app/campagnes',
  '/app/clients',
  '/app/commandes',
  '/app/commandes/00000000-0000-0000-0000-000000000000/ticket',
  '/app/commandes/sur-place',
  '/app/conversations',
  '/app/equipe',
  '/app/fidelite',
  '/app/livraison',
  '/app/marketing',
  '/app/marketing/campagnes',
  '/app/marketing/campagnes/nouvelle',
  '/app/marketing/campagnes/00000000-0000-0000-0000-000000000000',
  '/app/marketing/chaine',
  '/app/marketing/qr',
  '/app/marketing/sondages',
  '/app/marketing/statuts',
  '/app/menu',
  '/app/reglages',
  '/app/stats',
  '/app/statuts',
  '/admin',
  '/admin/restaurants',
  '/admin/restaurants/00000000-0000-0000-0000-000000000000',
  '/admin/lp/00000000-0000-0000-0000-000000000000',
]

test.describe('Garde d’authentification', () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} redirige vers /login`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login(\?.*)?$/)
    })
  }
})
