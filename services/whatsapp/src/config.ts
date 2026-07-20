function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`)
  return v
}

/**
 * Lecture d'une variable d'environnement NUMÉRIQUE (audit fiabilité lot B — correctif 5).
 *
 * `Number(process.env.X ?? défaut)` renvoyait `NaN` dès que la valeur était présente mais non
 * numérique (`CAMPAIGN_POLL_MS="15s"`, une unité, une virgule décimale…) : `setTimeout(tick, NaN)`
 * se comporte comme `setTimeout(tick, 0)` → boucle chaude silencieuse qui martèle la base et
 * Whapi. On échoue donc bruyamment AU BOOT plutôt que de dégrader la prod en silence.
 *
 * Variable absente ou vide → `defaut` (comportement inchangé, aucune valeur d'env valide ne change
 * de sens). Valeur présente mais non numérique, infinie, ou ≤ 0 (≤ -1 si `min: 0`) → erreur
 * explicite nommant la variable et la valeur reçue.
 */
export function numEnv(name: string, defaut: number, opts: { min?: number } = {}): number {
  const min = opts.min ?? 1
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return defaut
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    throw new Error(`Variable d'environnement ${name} : valeur non numérique « ${raw} » (attendu un nombre)`)
  }
  if (n < min) {
    throw new Error(`Variable d'environnement ${name} : valeur invalide « ${raw} » (attendu un nombre ≥ ${min})`)
  }
  return n
}

export function loadConfig() {
  return {
    port: numEnv('PORT', 8080),
    supabaseUrl: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    tokenKey: required('TOKEN_ENCRYPTION_KEY'),
    wheelSecret: required('WHEEL_JWT_SECRET'),
    wheelBaseUrl: required('WHEEL_BASE_URL'),
    campaignPollMs: numEnv('CAMPAIGN_POLL_MS', 15000),
    sendDelayMinMs: numEnv('CAMPAIGN_SEND_DELAY_MIN_MS', 4000),
    sendDelayMaxMs: numEnv('CAMPAIGN_SEND_DELAY_MAX_MS', 8000),
    dailyCap: numEnv('CAMPAIGN_DAILY_CAP', 500),
    batchSize: numEnv('CAMPAIGN_BATCH_SIZE', 50),
    statusPollMs: numEnv('STATUS_POLL_MS', 30000),
    lpFramesPollMs: numEnv('LP_FRAMES_POLL_MS', 60000),
    // Seule valeur numérique de config qui peut légitimement valoir 0 (« aucune photo de menu
    // envoyée ») : min: 0 au lieu du min: 1 par défaut.
    menuPhotosMax: numEnv('MENU_PHOTOS_MAX', 8, { min: 0 }),
    wheelReminderPollMs: numEnv('WHEEL_REMINDER_POLL_MS', 6 * 3600 * 1000),
    catalogSyncPollMs: numEnv('CATALOG_SYNC_POLL_MS', 60000),
    pollWorkerPollMs: numEnv('POLL_WORKER_POLL_MS', 30000),
    autoStatusPollMs: numEnv('AUTO_STATUS_POLL_MS', 300000),
    // Défauts alignés sur leurs pendants statuts (CA5 : Chaîne Auto est le pendant chaîne des
    // Statuts Auto, cf. plan § Tâche CA5) — réglables indépendamment via env si besoin.
    autoChannelPollMs: numEnv('AUTO_CHANNEL_POLL_MS', numEnv('AUTO_STATUS_POLL_MS', 300000)),
    channelPostsPollMs: numEnv('CHANNEL_POSTS_POLL_MS', numEnv('STATUS_POLL_MS', 30000)),
    // Secret partagé du webhook (audit fiabilité — correctif 3) : OPTIONNEL (rollout
    // progressif) — non défini, POST /hook/:channelUuid reste protégé par le seul UUID
    // comme avant ; défini, il exige `?s=<secret>` (cf. app.ts). Jamais loggé.
    webhookSharedSecret: process.env.WEBHOOK_SHARED_SECRET ?? null,
    // Analyses IA (page Analyses) : clé optionnelle — worker désactivé proprement si absente.
    mistralApiKey: process.env.MISTRAL_API_KEY ?? null,
    analysisPollMs: numEnv('ANALYSIS_POLL_MS', 30 * 60 * 1000),
  }
}
export type Config = ReturnType<typeof loadConfig>
