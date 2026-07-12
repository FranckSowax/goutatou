import { buildStatusCaption } from './captions.js'
import type { AutoStatusRepo } from './repo.js'

export interface AutoStatusWorkerDeps {
  repo: AutoStatusRepo
  /** Horloge injectée — jamais Date.now() en dur (contrat de test, cf. brief ST2). */
  now: () => Date
}

// Africa/Libreville = UTC+1 fixe, sans heure d'été : décalage constant, pas d'Intl/timeZone requis.
const LIBREVILLE_OFFSET_MS = 60 * 60 * 1000

/** "YYYY-MM-DD" et "HH:MM" à Libreville pour l'instant donné (calcul par décalage fixe UTC+1). */
function librevilleParts(date: Date): { dateKey: string; hhmm: string } {
  const local = new Date(date.getTime() + LIBREVILLE_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  const hh = String(local.getUTCHours()).padStart(2, '0')
  const mm = String(local.getUTCMinutes()).padStart(2, '0')
  return { dateKey: `${y}-${m}-${d}`, hhmm: `${hh}:${mm}` }
}

export async function runAutoStatusOnce(deps: AutoStatusWorkerDeps): Promise<void> {
  const now = deps.now()
  const { dateKey, hhmm } = librevilleParts(now)
  const nowIso = now.toISOString()
  const candidates = await deps.repo.listCandidates()

  for (const c of candidates) {
    let cursor = c.autoStatusCursor
    let lastSlot = c.autoStatusLastSlot
    const times = [...c.autoStatusTimes].sort()

    for (const slot of times) {
      if (hhmm < slot) continue
      const slotKey = `${dateKey} ${slot}`
      if (lastSlot === slotKey) continue // déjà exécuté aujourd'hui pour ce créneau

      const claimed = await deps.repo.claimSlot(c.restaurantId, slotKey, lastSlot)
      if (!claimed) continue // claim perdu (créneau déjà pris entre-temps)
      lastSlot = slotKey

      const dishes = await deps.repo.getPhotoDishes(c.restaurantId)
      if (dishes.length === 0) {
        console.log(`[auto-status] resto ${c.restaurantId} : aucun plat disponible avec photo, créneau ${slot} ignoré`)
        continue
      }

      const count = c.autoStatusCount
      const rows = []
      for (let i = 0; i < count; i++) {
        const dish = dishes[(cursor + i) % dishes.length]
        rows.push({
          restaurantId: c.restaurantId,
          content: buildStatusCaption({ name: dish.name, price: dish.price }, cursor + i),
          mediaUrl: dish.photoUrl,
          scheduledAt: nowIso,
        })
      }
      await deps.repo.insertGeneratedStatuses(rows)
      cursor = (cursor + count) % dishes.length
      await deps.repo.bumpCursor(c.restaurantId, cursor)
    }
  }
}

export function startAutoStatusWorker(deps: AutoStatusWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      await runAutoStatusOnce(deps)
    } catch (err) {
      console.error('[auto-status]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[auto-status] démarré')
  setTimeout(tick, deps.pollMs)
}
