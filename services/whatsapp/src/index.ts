import { createServiceClient } from '@goutatou/db'
import { WhapiClient } from '@goutatou/whapi'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { createRepo } from './repo.js'
import { createProcessor } from './processor.js'

const config = loadConfig()
const db = createServiceClient(config.supabaseUrl, config.serviceRoleKey)
const repo = createRepo(db, config.tokenKey)
const processWebhook = createProcessor(repo, (token) => new WhapiClient(token))

const app = createApp({ processWebhook })
app.listen(config.port, () => console.log(`[service-whatsapp] écoute sur :${config.port}`))
