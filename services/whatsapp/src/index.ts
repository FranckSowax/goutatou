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
import { createWheelReminderRepo } from './wheel/repo.js'
import { startWheelReminderWorker } from './wheel/worker.js'
import { createCatalogRepo } from './catalog/repo.js'
import { startCatalogWorker } from './catalog/worker.js'
import { createPollRepo } from './polls/repo.js'
import { startPollWorker } from './polls/worker.js'
import { createAutoStatusRepo } from './autostatus/repo.js'
import { startAutoStatusWorker } from './autostatus/worker.js'
import { createDecisionRepo } from './autostatus/decision-repo.js'
import { startStatusDecisionWorker } from './autostatus/decision-worker.js'
import { createApprovalRepo } from './autostatus/approval-repo.js'

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
  now: () => new Date(),
  pollMs: config.statusPollMs,
})
const lpFramesRepo = createLpFramesRepo(db)
startLpFramesWorker({
  repo: lpFramesRepo,
  runFfmpeg: createFfmpegRunner(),
  pollMs: config.lpFramesPollMs,
  // replace(/\/+$/,'') : un slash final dans SUPABASE_URL marquerait silencieusement
  // toutes les extractions en failed (préfixe à double slash ≠ mediaUrl du web).
  allowedMediaPrefix: `${config.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/lp-media/`,
})
const wheelReminderRepo = createWheelReminderRepo(db, config.tokenKey)
startWheelReminderWorker({
  repo: wheelReminderRepo,
  makeWhapi: (token) => new WhapiClient(token),
  pollMs: config.wheelReminderPollMs,
})
const catalogRepo = createCatalogRepo(db, config.tokenKey)
startCatalogWorker({
  repo: catalogRepo,
  makeWhapi: (token) => new WhapiClient(token),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  sendDelayMinMs: config.sendDelayMinMs,
  sendDelayMaxMs: config.sendDelayMaxMs,
  pollMs: config.catalogSyncPollMs,
})
const pollRepo = createPollRepo(db, config.tokenKey)
startPollWorker({
  repo: pollRepo,
  makeWhapi: (token) => new WhapiClient(token),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  sendDelayMinMs: config.sendDelayMinMs,
  sendDelayMaxMs: config.sendDelayMaxMs,
  pollMs: config.pollWorkerPollMs,
})
const autoStatusRepo = createAutoStatusRepo(db, config.tokenKey)
startAutoStatusWorker({
  repo: autoStatusRepo,
  makeWhapi: (token) => new WhapiClient(token),
  now: () => new Date(),
  pollMs: config.autoStatusPollMs,
})
const decisionRepo = createDecisionRepo(db, config.tokenKey)
startStatusDecisionWorker({
  repo: decisionRepo,
  makeWhapi: (token) => new WhapiClient(token),
  now: () => new Date(),
  pollMs: config.autoStatusPollMs,
})
const approvalRepo = createApprovalRepo(db)
const processWebhook = createProcessor(repo, (token) => new WhapiClient(token), {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  sendDelayMinMs: config.sendDelayMinMs,
  sendDelayMaxMs: config.sendDelayMaxMs,
  menuPhotosMax: config.menuPhotosMax,
  approvalRepo,
})

const app = createApp({ processWebhook })
app.listen(config.port, () => console.log(`[service-whatsapp] écoute sur :${config.port}`))
