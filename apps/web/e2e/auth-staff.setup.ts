import { test as setup, expect } from '@playwright/test'
import path from 'node:path'

export const STAFF_STATE = path.join(__dirname, '.auth', 'staff.json')

// Connexion employé réelle (onglet « Employé » → numéro WhatsApp + mot de passe) → sauvegarde la
// session réutilisée par le projet « staff ». Identifiants via E2E_STAFF_PHONE / E2E_STAFF_PASSWORD.
setup('authentifie l’employé', async ({ page }) => {
  const phone = process.env.E2E_STAFF_PHONE
  const password = process.env.E2E_STAFF_PASSWORD
  if (!phone || !password) throw new Error('E2E_STAFF_PHONE / E2E_STAFF_PASSWORD manquants')

  await page.goto('/login')
  await page.getByRole('tab', { name: 'Employé' }).click()
  await page.getByLabel('Numéro WhatsApp').fill(phone)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await page.waitForURL(/\/app(\/.*)?$/, { timeout: 15_000 })
  await expect(page).not.toHaveURL(/\/login/)

  await page.context().storageState({ path: STAFF_STATE })
})
