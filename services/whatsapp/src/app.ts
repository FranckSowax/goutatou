import { timingSafeEqual } from 'node:crypto'
import express from 'express'

export interface AppDeps {
  processWebhook: (channelUuid: string, payload: unknown) => Promise<void>
  /**
   * Secret partagé OPTIONNEL du webhook (audit fiabilité — correctif 3, env
   * WEBHOOK_SHARED_SECRET) : si défini, POST /hook/:channelUuid exige `?s=<secret>` —
   * l'UUID du canal seul ne suffit plus. Absent/null → comportement historique inchangé
   * (rollout progressif : poser l'env APRÈS avoir mis à jour les URLs de webhook Whapi).
   */
  webhookSharedSecret?: string | null
}

/** Comparaison en temps constant — jamais de `===` sur un secret, jamais de log du secret. */
function secretMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual exige des buffers de même longueur ; la comparaison des longueurs ne
  // fuit que la longueur du secret, pas son contenu.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function createApp(deps: AppDeps): express.Express {
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  app.post('/hook/:channelUuid', (req, res) => {
    if (deps.webhookSharedSecret && !secretMatches(req.query.s, deps.webhookSharedSecret)) {
      // 401 sans corps détaillé : ne rien révéler (ni raison, ni secret attendu).
      res.status(401).end()
      return
    }
    // 200 immédiat : Whapi attend une réponse < 5 s ; le traitement est asynchrone.
    res.status(200).json({ status: 'ok' })
    deps.processWebhook(req.params.channelUuid, req.body).catch((err) => {
      console.error('[webhook] traitement échoué', err)
    })
  })

  return app
}
