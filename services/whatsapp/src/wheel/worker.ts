import type { WhapiClient } from '@goutatou/whapi'
import type { DueReminder, WheelReminderRepo } from './repo.js'

export interface WheelReminderWorkerDeps {
  repo: WheelReminderRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendText'>
}

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function reminderMessage(label: string, expiresAtIso: string): string {
  return `⏰ Votre lot "${label}" expire le ${formatDateFr(expiresAtIso)} — pensez à le récupérer !`
}

export async function processReminderOnce(r: DueReminder, deps: WheelReminderWorkerDeps): Promise<void> {
  const channel = await deps.repo.getChannel(r.restaurantId)
  if (!channel || channel.status !== 'active') return
  const whapi = deps.makeWhapi(channel.token)
  try {
    // Best-effort : le rappel est déjà "consommé" côté DB (claim-first = at-most-once), un
    // échec d'envoi ici n'est pas relancé — acceptable pour une notification de confort.
    await whapi.sendText(r.chatId, reminderMessage(r.label, r.expiresAt))
  } catch (err) {
    console.error('[wheel-reminder] envoi échoué', err)
  }
}

export function startWheelReminderWorker(deps: WheelReminderWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      const due = await deps.repo.claimExpiringSpins(new Date().toISOString())
      for (const r of due) {
        // Isolation par rappel (audit lot B — correctif 3) : un throw sur un rappel ne doit pas
        // abandonner les rappels suivants du même tick.
        try {
          await processReminderOnce(r, deps)
        } catch (err) {
          console.error('[wheel-reminder] rappel', r.id, err)
        }
      }
    } catch (err) {
      console.error('[wheel-reminder]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[wheel-reminder] démarré')
  setTimeout(tick, deps.pollMs)
}
