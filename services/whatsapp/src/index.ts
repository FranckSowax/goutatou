import { createServiceClient } from '@goutatou/db'
import { WhapiClient } from '@goutatou/whapi'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { createRepo } from './repo.js'
import { createProcessor } from './processor.js'
import { startNotifier } from './notifier.js'
import { createCampaignRepo } from './campaigns/repo.js'
import { startCampaignWorker } from './campaigns/worker.js'
import { createStatusRepo } from './statuses/repo.js'
import { startStatusWorker } from './statuses/worker.js'
import { createLpFramesRepo } from './lpframes/repo.js'
import { createFfmpegRunner, startLpFramesWorker } from './lpframes/worker.js'

const config = loadConfig()
const db = createServiceClient(config.supabaseUrl, config.serviceRoleKey)
const repo = createRepo(db, config.tokenKey)
startNotifier(db, config.tokenKey, config.wheelSecret, config.wheelBaseUrl)
const campaignRepo = createCampaignRepo(db, config.tokenKey)
startCampaignWorker({
  repo: campaignRepo,
  makeWhapi: (token) => new WhapiClient(token),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  dailyCap: config.dailyCap,
  sendDelayMinMs: config.sendDelayMinMs,
  sendDelayMaxMs: config.sendDelayMaxMs,
  batchSize: config.batchSize,
  pollMs: config.campaignPollMs,
})
const statusRepo = createStatusRepo(db, config.tokenKey)
startStatusWorker({
  repo: statusRepo,
  makeWhapi: (token) => new WhapiClient(token),
  pollMs: config.statusPollMs,
})
const lpFramesRepo = createLpFramesRepo(db)
startLpFramesWorker({
  repo: lpFramesRepo,
  runFfmpeg: createFfmpegRunner(),
  pollMs: config.lpFramesPollMs,
})
const processWebhook = createProcessor(repo, (token) => new WhapiClient(token))

const app = createApp({ processWebhook })
app.listen(config.port, () => console.log(`[service-whatsapp] écoute sur :${config.port}`))
