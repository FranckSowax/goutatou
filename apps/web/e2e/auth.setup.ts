import { test as setup, expect } from '@playwright/test'
import path from 'node:path'

export const OWNER_STATE = path.join(__dirname, '.auth', 'owner.json')

// Connexion patron réelle → sauvegarde la session (cookies) réutilisée par le projet
// « authenticated ». Les identifiants viennent de l'environnement (E2E_OWNER_EMAIL /
// E2E_OWNER_PASSWORD), jamais du code ni du dépôt. Ce projet n'est ajouté à la config que
// lorsque ces variables sont présentes (cf. playwright.config.ts).
setup('authentifie le patron', async ({ page }) => {
  const email = process.env.E2E_OWNER_EMAIL
  const password = process.env.E2E_OWNER_PASSWORD
  if (!email || !password) throw new Error('E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD manquants')

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  // La connexion réussie redirige hors de /login (vers /app).
  await page.waitForURL(/\/app(\/.*)?$/, { timeout: 15_000 })
  await expect(page).not.toHaveURL(/\/login/)

  await page.context().storageState({ path: OWNER_STATE })
})
