import { anonymizeMessages } from './anonymize.js'
import { callMistral, MISTRAL_MODEL } from './mistral.js'
import { duePeriods, periodBoundsUtc, periodLabel } from './periods.js'
import { buildAnalysisPrompt } from './prompt.js'
import type { AnalysisRepo } from './repo.js'

export interface AnalysisWorkerDeps {
  repo: AnalysisRepo
  apiKey: string | null
  pollMs: number
  /** Pause anti rate-limit entre deux appels Mistral. */
  callDelayMs?: number
}

/**
 * Génère un rapport pour un (resto, période) s'il n'existe pas encore : charge conversations +
 * chiffres, anonymise, appelle Mistral, stocke. Best-effort — toute erreur est loggée et n'arrête
 * pas les autres restos/périodes.
 */
async function generateOne(
  repo: AnalysisRepo,
  apiKey: string,
  restaurantId: string,
  period: ReturnType<typeof duePeriods>[number],
  failedKeys: Set<string>,
): Promise<boolean> {
  const key = `${restaurantId}:${period.type}:${period.start}`
  // Déjà échoué dans ce process (Mistral facturé mais écriture KO, ou lecture KO) → on ne réessaie
  // pas avant un redémarrage, pour borner le coût. Idempotence normale via reportExists sinon.
  if (failedKeys.has(key)) return false
  if (await repo.reportExists(restaurantId, period.type, period.start)) return false

  const { startUtc, endUtc } = periodBoundsUtc(period.start, period.end)
  const [rawMessages, headline] = await Promise.all([
    repo.loadConversations(restaurantId, startUtc, endUtc),
    repo.loadHeadline(restaurantId, startUtc, endUtc),
  ])

  const { messages, truncated } = anonymizeMessages(rawMessages)
  const prompt = buildAnalysisPrompt(periodLabel(period), messages, headline, truncated)
  const insights = await callMistral(apiKey, prompt)
  try {
    await repo.saveReport({ restaurantId, period, headline, insights, model: MISTRAL_MODEL })
  } catch (err) {
    failedKeys.add(key)
    throw err
  }
  return true
}

export function startAnalysisWorker(deps: AnalysisWorkerDeps): void {
  if (!deps.apiKey) {
    console.log('[analysis] MISTRAL_API_KEY absente — worker désactivé')
    return
  }
  const apiKey = deps.apiKey
  const callDelayMs = deps.callDelayMs ?? 2000
  // Persiste sur toute la vie du process : (resto, période) dont l'écriture a échoué après un appel
  // Mistral facturé — on ne les rappelle plus jusqu'au redémarrage (garde-fou anti-boucle de coût).
  const failedKeys = new Set<string>()

  const tick = async () => {
    try {
      const restaurants = await deps.repo.listPremiumRestaurants()
      const periods = duePeriods(new Date())
      for (const restaurantId of restaurants) {
        for (const period of periods) {
          try {
            const generated = await generateOne(deps.repo, apiKey, restaurantId, period, failedKeys)
            if (generated) await new Promise((r) => setTimeout(r, callDelayMs))
          } catch (err) {
            console.error(`[analysis] échec ${restaurantId} ${period.type} ${period.start}`, err)
          }
        }
      }
    } catch (err) {
      console.error('[analysis]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[analysis] démarré')
  setTimeout(tick, deps.pollMs)
}
