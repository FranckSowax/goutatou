import { loadConfig } from './config.js'
import { createApp } from './app.js'

const config = loadConfig()
// Le vrai processor est branché en Task 10 ; stub temporaire pour démarrer le service.
const app = createApp({ processWebhook: async () => {} })
app.listen(config.port, () => console.log(`[service-whatsapp] écoute sur :${config.port}`))
