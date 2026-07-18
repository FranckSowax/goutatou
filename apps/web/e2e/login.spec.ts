import { test, expect } from '@playwright/test'

// Parcours de connexion : la page /login est publique et rendue sans accès base de données,
// donc déterministe pour un premier e2e. Vérifie la bascule Patron (email) / Employé (numéro).
test.describe('Connexion', () => {
  test('affiche le formulaire patron par défaut', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Goutatou' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
  })

  test('bascule vers le mode employé (numéro WhatsApp)', async ({ page }) => {
    await page.goto('/login')
    // En mode patron, pas de champ numéro.
    await expect(page.getByLabel('Numéro WhatsApp')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Employé' }).click()

    await expect(page.getByLabel('Numéro WhatsApp')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Employé' })).toHaveAttribute('aria-selected', 'true')
  })
})
