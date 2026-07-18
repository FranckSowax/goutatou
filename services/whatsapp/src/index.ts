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
import { createAutoChannelRepo } from './autochannel/repo.js'
import { startAutoChannelWorker } from './autochannel/worker.js'
import { createChannelPostsRepo } from './channelposts/repo.js'
import { startChannelPostsWorker } from './channelposts/worker.js'
import { createChannelDecisionRepo } from './autochannel/decision-repo.js'
import { startChannelDecisionWorker } from './autochannel/decision-worker.js'
import { createChannelApprovalRepo } from './autochannel/approval-repo.js'
import { createArrivalRepo } from './drive/arrival-repo.js'
import { createAnalysisRepo } from './analysis/repo.js'
import { startAnalysisWorker } from './analysis/worker.js'

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
const autoChannelRepo = createAutoChannelRepo(db, config.tokenKey)
startAutoChannelWorker({
  repo: autoChannelRepo,
  makeWhapi: (token) => new WhapiClient(token),
  now: () => new Date(),
  pollMs: config.autoChannelPollMs,
})
const channelPostsRepo = createChannelPostsRepo(db, config.tokenKey)
startChannelPostsWorker({
  repo: channelPostsRepo,
  makeWhapi: (token) => new WhapiClient(token),
  now: () => new Date(),
  pollMs: config.channelPostsPollMs,
})
const channelDecisionRepo = createChannelDecisionRepo(db, config.tokenKey)
startChannelDecisionWorker({
  repo: channelDecisionRepo,
  makeWhapi: (token) => new WhapiClient(token),
  now: () => new Date(),
  pollMs: config.autoChannelPollMs,
})
const channelApprovalRepo = createChannelApprovalRepo(db)
// Analyses IA (page Analyses) : génération planifiée des rapports quotidien/hebdo/mensuel via
// Mistral. Désactivé proprement si MISTRAL_API_KEY est absente (fonctionnalité additive).
const analysisRepo = createAnalysisRepo(db)
startAnalysisWorker({ repo: analysisRepo, apiKey: config.mistralApiKey, pollMs: config.analysisPollMs })
const arrivalRepo = createArrivalRepo(db)
const processWebhook = createProcessor(repo, (token) => new WhapiClient(token), {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  sendDelayMinMs: config.sendDelayMinMs,
  sendDelayMaxMs: config.sendDelayMaxMs,
  menuPhotosMax: config.menuPhotosMax,
  approvalRepo,
  channelApprovalRepo,
  arrivalRepo,
  // Carte de fidélité : réutilise le secret/base URL de la roue (cf. config) pour émettre le
  // lien perso /f/<token> sur les mots-clés carte/fidélité/roue quand loyalty_enabled.
  loyaltySecret: config.wheelSecret,
  loyaltyBaseUrl: config.wheelBaseUrl,
})

const app = createApp({ processWebhook })
app.listen(config.port, () => console.log(`[service-whatsapp] écoute sur :${config.port}`))
