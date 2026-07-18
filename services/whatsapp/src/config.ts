function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`)
  return v
}

export function loadConfig() {
  return {
    port: Number(process.env.PORT ?? 8080),
    supabaseUrl: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    tokenKey: required('TOKEN_ENCRYPTION_KEY'),
    wheelSecret: required('WHEEL_JWT_SECRET'),
    wheelBaseUrl: required('WHEEL_BASE_URL'),
    campaignPollMs: Number(process.env.CAMPAIGN_POLL_MS ?? 15000),
    sendDelayMinMs: Number(process.env.CAMPAIGN_SEND_DELAY_MIN_MS ?? 4000),
    sendDelayMaxMs: Number(process.env.CAMPAIGN_SEND_DELAY_MAX_MS ?? 8000),
    dailyCap: Number(process.env.CAMPAIGN_DAILY_CAP ?? 500),
    batchSize: Number(process.env.CAMPAIGN_BATCH_SIZE ?? 50),
    statusPollMs: Number(process.env.STATUS_POLL_MS ?? 30000),
    lpFramesPollMs: Number(process.env.LP_FRAMES_POLL_MS ?? 60000),
    menuPhotosMax: Math.max(0, Number(process.env.MENU_PHOTOS_MAX ?? 8)),
    wheelReminderPollMs: Number(process.env.WHEEL_REMINDER_POLL_MS ?? 6 * 3600 * 1000),
    catalogSyncPollMs: Number(process.env.CATALOG_SYNC_POLL_MS ?? 60000),
    pollWorkerPollMs: Number(process.env.POLL_WORKER_POLL_MS ?? 30000),
    autoStatusPollMs: Number(process.env.AUTO_STATUS_POLL_MS ?? 300000),
    // Défauts alignés sur leurs pendants statuts (CA5 : Chaîne Auto est le pendant chaîne des
    // Statuts Auto, cf. plan § Tâche CA5) — réglables indépendamment via env si besoin.
    autoChannelPollMs: Number(process.env.AUTO_CHANNEL_POLL_MS ?? process.env.AUTO_STATUS_POLL_MS ?? 300000),
    channelPostsPollMs: Number(process.env.CHANNEL_POSTS_POLL_MS ?? process.env.STATUS_POLL_MS ?? 30000),
    // Analyses IA (page Analyses) : clé optionnelle — worker désactivé proprement si absente.
    mistralApiKey: process.env.MISTRAL_API_KEY ?? null,
    analysisPollMs: Number(process.env.ANALYSIS_POLL_MS ?? 30 * 60 * 1000),
  }
}
export type Config = ReturnType<typeof loadConfig>
