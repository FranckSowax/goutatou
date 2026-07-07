import express from 'express'

export interface AppDeps {
  processWebhook: (channelUuid: string, payload: unknown) => Promise<void>
}

export function createApp(deps: AppDeps): express.Express {
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  app.post('/hook/:channelUuid', (req, res) => {
    // 200 immédiat : Whapi attend une réponse < 5 s ; le traitement est asynchrone.
    res.status(200).json({ status: 'ok' })
    deps.processWebhook(req.params.channelUuid, req.body).catch((err) => {
      console.error('[webhook] traitement échoué', err)
    })
  })

  return app
}
