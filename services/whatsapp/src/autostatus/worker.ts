import type { WhapiClient } from '@goutatou/whapi'
import { buildStatusCaption } from './captions.js'
import type { AutoStatusCandidate, AutoStatusRepo, NewAutoStatusRow } from './repo.js'

export interface AutoStatusWorkerDeps {
  repo: AutoStatusRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendImage' | 'sendQuickReplies' | 'sendPoll'>
  /** Horloge injectée — jamais Date.now() en dur (contrat de test, cf. brief ST2). */
  now: () => Date
}

// Africa/Libreville = UTC+1 fixe, sans heure d'été : décalage constant, pas d'Intl/timeZone requis.
const LIBREVILLE_OFFSET_MS = 60 * 60 * 1000

/**
 * Fenêtre d'avance de génération (spec docs/superpowers/specs/2026-07-13-validation-statuts-design.md) :
 * un créneau est généré dès que `now >= créneau - 120 min`, ce qui laisse le temps à une validation
 * (gérant ou groupe) avant l'heure de publication elle-même (scheduled_at reste le créneau).
 */
export const AUTO_STATUS_LEAD_MIN = 120

const MANAGER_PHONE_MISSING_ERROR = 'Renseignez le numéro du gérant validateur.'
const GROUP_MISSING_ERROR = "Créez d'abord le groupe Cuisine."
const MANAGER_APPROVAL_QUESTION = 'Publier ce statut ?'
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
 * Libreville en ISO UTC. `Date.UTC(...)` traite les composants comme s'ils étaient déjà en UTC,
 * il suffit donc de soustraire le décalage fixe +1h pour obtenir l'instant UTC réel du créneau.
 */
function slotToUtcIso(dateKey: string, hhmm: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const localAsUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0, 0)
  return new Date(localAsUtcMs - LIBREVILLE_OFFSET_MS).toISOString()
}

/**
 * Répartit les statuts fraîchement générés selon `restaurants.auto_status_validation` :
 * - 'none'    → insertion directe en `scheduled` (comportement historique, inchangé).
 * - 'manager' → insertion en `pending_approval` puis, par statut, image + boutons Valider/Refuser
 *   envoyés au numéro gérant (auto_status_manager_phone, défaut contact_phone). Numéro absent →
 *   chaque statut généré est marqué `failed` (FR), aucun envoi.
 * - 'group'   → insertion en `pending_approval` puis image de chaque statut envoyée au groupe staff,
 *   suivie d'UN SEUL sondage récapitulatif « Oui/Non ». Groupe absent → chaque statut généré est
 *   marqué `failed` (FR), aucun envoi.
 * Best-effort : un échec d'envoi individuel (image ou boutons) est logué, jamais bloquant pour les
 * autres statuts du lot.
 */
async function dispatchGenerated(c: AutoStatusCandidate, rows: NewAutoStatusRow[], nowIso: string, deps: AutoStatusWorkerDeps): Promise<void> {
  if (c.autoStatusValidation === 'none') {
    await deps.repo.insertGeneratedStatuses(rows)
    return
  }

  const inserted = await deps.repo.insertPendingApprovalStatuses(rows)
  if (inserted.length === 0) return

  if (c.autoStatusValidation === 'manager') {
    const managerPhone = c.autoStatusManagerPhone ?? c.contactPhone
    if (!managerPhone) {
      for (const row of inserted) await deps.repo.markFailed(row.id, MANAGER_PHONE_MISSING_ERROR)
      return
    }
    const channel = await deps.repo.getChannel(c.restaurantId)
    if (!channel || channel.status !== 'active') {
      console.error(`[auto-status] resto ${c.restaurantId} : canal Whapi indisponible pour la demande de validation`)
      return
    }
    const whapi = deps.makeWhapi(channel.token)
    for (const row of inserted) {
      try {
        await whapi.sendImage(managerPhone, row.mediaUrl, row.content)
        const res = await whapi.sendQuickReplies(managerPhone, MANAGER_APPROVAL_QUESTION, [
          { id: `stapp:${row.id}`, title: VALIDATE_LABEL },
          { id: `strej:${row.id}`, title: REJECT_LABEL },
        ])
        await deps.repo.markApprovalRequested([row.id], res.id, nowIso)
      } catch (err) {
        console.error('[auto-status]', err)
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
    console.error(`[auto-status] resto ${c.restaurantId} : canal Whapi indisponible pour la demande de validation`)
    return
  }
  const whapi = deps.makeWhapi(channel.token)
  for (const row of inserted) {
    try {
      await whapi.sendImage(groupId, row.mediaUrl, row.content)
    } catch (err) {
      console.error('[auto-status]', err)
    }
  }
  try {
    const res = await whapi.sendPoll(groupId, `📸 Publier les ${inserted.length} statuts du jour ?`, ['Oui', 'Non'])
    await deps.repo.markApprovalRequested(inserted.map((row) => row.id), res.id, nowIso)
  } catch (err) {
    console.error('[auto-status]', err)
  }
}

export async function runAutoStatusOnce(deps: AutoStatusWorkerDeps): Promise<void> {
  const now = deps.now()
  const { dateKey, hhmm } = librevilleParts(now)
  const nowIso = now.toISOString()
  const nowMinutes = toMinutes(hhmm)
  const candidates = await deps.repo.listCandidates()

  for (const c of candidates) {
    let cursor = c.autoStatusCursor
    const lastSlot = c.autoStatusLastSlot
    const times = [...c.autoStatusTimes].sort()

    // UN SEUL créneau par tick : le plus récent déjà dû (générable) — cf. commentaires historiques
    // sur le format "YYYY-MM-DD HH:MM" (tri chronologique, skip par comparaison <=) et l'absence de
    // rattrapage multi-créneaux. « Dû pour génération » = now >= créneau - AUTO_STATUS_LEAD_MIN,
    // alors que le créneau lui-même (slotKey, scheduled_at) reste inchangé — seule l'AVANCE de
    // génération est décalée, pas l'heure de publication.
    const dueSlots = times.filter((slot) => nowMinutes >= toMinutes(slot) - AUTO_STATUS_LEAD_MIN)
    if (dueSlots.length === 0) continue
    const slot = dueSlots[dueSlots.length - 1]
    {
      const slotKey = `${dateKey} ${slot}`
      if (lastSlot !== null && slotKey <= lastSlot) continue // déjà exécuté (ou créneau plus ancien)

      const claimed = await deps.repo.claimSlot(c.restaurantId, slotKey, lastSlot)
      if (!claimed) continue // claim perdu (créneau déjà pris entre-temps)

      const dishes = await deps.repo.getPhotoDishes(c.restaurantId)
      if (dishes.length === 0) {
        console.log(`[auto-status] resto ${c.restaurantId} : aucun plat disponible avec photo, créneau ${slot} ignoré`)
        continue
      }

      const count = c.autoStatusCount
      const scheduledAt = slotToUtcIso(dateKey, slot)
      const rows: NewAutoStatusRow[] = []
      for (let i = 0; i < count; i++) {
        const dish = dishes[(cursor + i) % dishes.length]
        rows.push({
          restaurantId: c.restaurantId,
          content: buildStatusCaption({ name: dish.name, price: dish.price }, cursor + i),
          mediaUrl: dish.photoUrl,
          scheduledAt,
          echoToChannel: c.autoStatusEchoChannel,
        })
      }
      cursor = (cursor + count) % dishes.length
      await deps.repo.bumpCursor(c.restaurantId, cursor)

      await dispatchGenerated(c, rows, nowIso, deps)
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
