import { test, expect } from '@playwright/test'

// Pages de l'espace connecté (patron), testées avec la session sauvegardée par auth.setup.ts.
// On vérifie que chaque page se rend réellement : reste sur sa route (pas de redirection /login),
// affiche du contenu, et n'affiche pas d'erreur applicative. Ce fichier ne s'exécute que dans le
// projet « authenticated », activé quand E2E_OWNER_EMAIL/PASSWORD sont fournis.
const APP_PAGES: { path: string; heading: string }[] = [
  { path: '/app', heading: 'Accueil' },
  { path: '/app/commandes', heading: 'Commandes' },
  { path: '/app/commandes/sur-place', heading: 'Sur place' },
  { path: '/app/menu', heading: 'Menu' },
  { path: '/app/livraison', heading: 'Livraison' },
  { path: '/app/conversations', heading: 'Conversations' },
  { path: '/app/clients', heading: 'Clients' },
  { path: '/app/stats', heading: 'Statistiques' },
  { path: '/app/analyses', heading: 'Analyses' },
  { path: '/app/marketing', heading: 'Marketing' },
  { path: '/app/marketing/campagnes', heading: 'Campagnes' },
  { path: '/app/marketing/chaine', heading: 'Chaîne' },
  { path: '/app/marketing/qr', heading: 'QR' },
  { path: '/app/marketing/sondages', heading: 'Sondages' },
  { path: '/app/marketing/statuts', heading: 'Statuts' },
  { path: '/app/fidelite', heading: 'fidélité' },
  { path: '/app/equipe', heading: 'Équipe' },
  { path: '/app/reglages', heading: 'Réglages' },
]

test.describe('Pages connectées (patron)', () => {
  for (const { path, heading } of APP_PAGES) {
    test(`${path} se rend`, async ({ page }) => {
      await page.goto(path)
      // Pas de retour au login (session valide) ni d'erreur applicative.
      await expect(page).not.toHaveURL(/\/login/)
      await expect(page.getByText('Application error')).toHaveCount(0)
      await expect(page.locator('main')).toBeVisible()
      // Contenu clé (insensible à la casse pour tolérer accents/variantes).
      await expect(page.getByText(new RegExp(heading, 'i')).first()).toBeVisible()
    })
  }
})
