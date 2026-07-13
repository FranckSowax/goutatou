import type { WhapiClient } from '@goutatou/whapi'
import { buildChannelCaption } from './captions.js'
import type { AutoChannelCandidate, AutoChannelRepo, NewChannelPostRow } from './repo.js'

export interface AutoChannelWorkerDeps {
  repo: AutoChannelRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendImage' | 'sendQuickReplies' | 'sendPoll'>
  /** Horloge injectée — jamais Date.now() en dur (contrat de test, cf. autostatus/worker.ts). */
  now: () => Date
}

// Africa/Libreville = UTC+1 fixe, sans heure d'été : décalage constant, pas d'Intl/timeZone requis.
const LIBREVILLE_OFFSET_MS = 60 * 60 * 1000

/**
 * Fenêtre d'avance de génération (mirror autostatus/worker.ts AUTO_STATUS_LEAD_MIN) : un créneau est
 * généré dès que `now >= créneau - 120 min`, ce qui laisse le temps à une validation (gérant ou groupe)
 * avant l'heure de publication elle-même (scheduled_at reste le créneau).
 */
export const AUTO_CHANNEL_LEAD_MIN = 120

const MANAGER_PHONE_MISSING_ERROR = 'Renseignez le numéro du gérant validateur.'
const GROUP_MISSING_ERROR = "Créez d'abord le groupe Cuisine."
const MANAGER_APPROVAL_QUESTION = 'Publier ce post chaîne ?'
const VALIDATE_LABEL = '✅ Valider'
const REJECT_LABEL = '❌ Refuser'

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

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Inverse de `librevilleParts` : convertit un "YYYY-MM-DD" + "HH:MM" interprétés comme heure de
 * Libreville en ISO UTC. `Date.UTC(...)` traite les composants comme s'ils étaient déjà en UTC, il
 * suffit donc de soustraire le décalage fixe +1h pour obtenir l'instant UTC réel du créneau.
 */
function slotToUtcIso(dateKey: string, hhmm: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const localAsUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0, 0)
  return new Date(localAsUtcMs - LIBREVILLE_OFFSET_MS).toISOString()
}

/**
 * Répartit les posts chaîne fraîchement générés selon `restaurants.auto_status_validation` (réutilisée
 * à l'identique — pas de nouvelle colonne de validation, cf. plan CA3) :
 * - 'none'    → insertion directe en `scheduled`.
 * - 'manager' → insertion en `pending_approval` puis, par post : image + boutons Valider/Refuser
 *   (`chapp:`/`chrej:`) envoyés au numéro gérant (auto_status_manager_phone, défaut contact_phone).
 *   Numéro absent → chaque post généré est marqué `failed` (FR), aucun envoi.
 * - 'group'   → insertion en `pending_approval` puis image de chaque post envoyée au groupe staff,
 *   suivie d'UN SEUL sondage récapitulatif « Oui/Non ». Groupe absent → chaque post généré est marqué
 *   `failed` (FR), aucun envoi.
 * Best-effort : un échec d'envoi individuel (image ou boutons) est logué, jamais bloquant pour les
 * autres posts du lot.
 */
async function dispatchGenerated(c: AutoChannelCandidate, rows: NewChannelPostRow[], nowIso: string, deps: AutoChannelWorkerDeps): Promise<void> {
  if (c.autoStatusValidation === 'none') {
    await deps.repo.insertScheduledPosts(rows)
    return
  }

  const inserted = await deps.repo.insertPendingApprovalPosts(rows)
  if (inserted.length === 0) return

  if (c.autoStatusValidation === 'manager') {
    const managerPhone = c.autoStatusManagerPhone ?? c.contactPhone
    if (!managerPhone) {
      for (const row of inserted) await deps.repo.markFailed(row.id, MANAGER_PHONE_MISSING_ERROR)
      return
    }
    const channel = await deps.repo.getChannel(c.restaurantId)
    if (!channel || channel.status !== 'active') {
      console.error(`[auto-channel] resto ${c.restaurantId} : canal Whapi indisponible pour la demande de validation`)
      return
    }
    const whapi = deps.makeWhapi(channel.token)
    for (const row of inserted) {
      try {
        await whapi.sendImage(managerPhone, row.mediaUrl, row.content)
        const res = await whapi.sendQuickReplies(managerPhone, MANAGER_APPROVAL_QUESTION, [
          { id: `chapp:${row.id}`, title: VALIDATE_LABEL },
          { id: `chrej:${row.id}`, title: REJECT_LABEL },
        ])
        await deps.repo.markApprovalRequested([row.id], res.id, nowIso)
      } catch (err) {
        console.error('[auto-channel]', err)
      }
    }
    return
  }

  // 'group'
  const groupId = c.staffGroupId
  if (!groupId) {
    for (const row of inserted) await deps.repo.markFailed(row.id, GROUP_MISSING_ERROR)
    return
  }
  const channel = await deps.repo.getChannel(c.restaurantId)
  if (!channel || channel.status !== 'active') {
    console.error(`[auto-channel] resto ${c.restaurantId} : canal Whapi indisponible pour la demande de validation`)
    return
  }
  const whapi = deps.makeWhapi(channel.token)
  for (const row of inserted) {
    try {
      await whapi.sendImage(groupId, row.mediaUrl, row.content)
    } catch (err) {
      console.error('[auto-channel]', err)
    }
  }
  try {
    const res = await whapi.sendPoll(groupId, `📣 Publier les ${inserted.length} posts chaîne du jour ?`, ['Oui', 'Non'])
    await deps.repo.markApprovalRequested(inserted.map((row) => row.id), res.id, nowIso)
  } catch (err) {
    console.error('[auto-channel]', err)
  }
}

export async function runAutoChannelOnce(deps: AutoChannelWorkerDeps): Promise<void> {
  const now = deps.now()
  const { dateKey, hhmm } = librevilleParts(now)
  const nowIso = now.toISOString()
  const nowMinutes = toMinutes(hhmm)
  const candidates = await deps.repo.listCandidates()

  for (const c of candidates) {
    let cursor = c.autoChannelCursor
    const lastSlot = c.autoChannelLastSlot
    const times = [...c.autoChannelTimes].sort()

    // UN SEUL créneau par tick : le plus récent déjà dû (générable), cf. autostatus/worker.ts.
    const dueSlots = times.filter((slot) => nowMinutes >= toMinutes(slot) - AUTO_CHANNEL_LEAD_MIN)
    if (dueSlots.length === 0) continue
    const slot = dueSlots[dueSlots.length - 1]
    {
      const slotKey = `${dateKey} ${slot}`
      if (lastSlot !== null && slotKey <= lastSlot) continue // déjà exécuté (ou créneau plus ancien)

      const claimed = await deps.repo.claimSlot(c.restaurantId, slotKey, lastSlot)
      if (!claimed) continue // claim perdu (créneau déjà pris entre-temps)

      const dishes = await deps.repo.getPhotoDishes(c.restaurantId)
      if (dishes.length === 0) {
        console.log(`[auto-channel] resto ${c.restaurantId} : aucun plat disponible avec photo, créneau ${slot} ignoré`)
        continue
      }

      const count = c.autoChannelCount
      const scheduledAt = slotToUtcIso(dateKey, slot)
      const rows: NewChannelPostRow[] = []
      for (let i = 0; i < count; i++) {
        const dish = dishes[(cursor + i) % dishes.length]
        rows.push({
          restaurantId: c.restaurantId,
          content: buildChannelCaption({ name: dish.name, price: dish.price }, cursor + i, c.contactPhone),
          mediaUrl: dish.photoUrl,
          scheduledAt,
        })
      }
      cursor = (cursor + count) % dishes.length
      await deps.repo.bumpCursor(c.restaurantId, cursor)

      await dispatchGenerated(c, rows, nowIso, deps)
    }
  }
}

export function startAutoChannelWorker(deps: AutoChannelWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      await runAutoChannelOnce(deps)
    } catch (err) {
      console.error('[auto-channel]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[auto-channel] démarré')
  setTimeout(tick, deps.pollMs)
}
