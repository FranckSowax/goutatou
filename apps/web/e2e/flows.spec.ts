import { test, expect, type Page } from '@playwright/test'

// Parcours mutatifs testés avec la session patron. Chaque test nettoie/restaure ses effets pour
// rester rejouable sur la base réelle (Chez Demo). Projet « authenticated » uniquement.
test.describe('Parcours patron', () => {
  test.describe.configure({ retries: 1 })

  const PALIER_LABEL = 'E2E palier test'
  const PALIER_SEUIL = '997' // seuil élevé improbable pour éviter tout conflit avec les vrais paliers

  async function deletePalierIfPresent(page: Page) {
    const row = page.getByRole('row').filter({ has: page.locator(`input[value="${PALIER_LABEL}"]`) })
    if (await row.count()) {
      await row.getByRole('button', { name: 'Suppr.' }).first().click()
      await expect(page.locator(`input[value="${PALIER_LABEL}"]`)).toHaveCount(0)
    }
  }

  test('créer puis supprimer un palier de fidélité', async ({ page }) => {
    await page.goto('/app/fidelite?tab=paliers', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Paliers' })).toBeVisible()

    // Repart propre si un run précédent a laissé le palier de test.
    await deletePalierIfPresent(page)

    await page.getByLabel('Seuil (commandes)').last().fill(PALIER_SEUIL)
    await page.getByLabel('Lot', { exact: true }).last().fill(PALIER_LABEL)
    await page.getByRole('button', { name: 'Ajouter le palier' }).click()

    // Le palier créé apparaît (input libellé pré-rempli côté serveur). Deux vues coexistent dans
    // le DOM (table desktop + carte mobile) → `.first()`.
    await expect(page.locator(`input[value="${PALIER_LABEL}"]`).first()).toBeVisible()

    // Nettoyage : suppression du palier de test.
    await deletePalierIfPresent(page)
    await expect(page.locator(`input[value="${PALIER_LABEL}"]`)).toHaveCount(0)
  })

  test('éditer puis restaurer la note d’un client', async ({ page }) => {
    await page.goto('/app/clients', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible()

    const firstClient = page.locator('ul li button').first()
    test.skip((await firstClient.count()) === 0, 'Aucun client sur ce restaurant')
    await firstClient.click()

    const note = page.locator('#client-note')
    await expect(note).toBeVisible()
    const original = await note.inputValue()
    const testNote = `note e2e ${original}`.slice(0, 200)

    await note.fill(testNote)
    await page.getByRole('button', { name: 'Enregistrer la note' }).click()
    await expect(page.getByText('Note enregistrée.')).toBeVisible()

    // Restaure la note d'origine.
    await note.fill(original)
    await page.getByRole('button', { name: 'Enregistrer la note' }).click()
    await expect(page.getByText('Note enregistrée.')).toBeVisible()
  })
})
