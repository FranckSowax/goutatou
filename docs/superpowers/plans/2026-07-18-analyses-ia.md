# Analyses IA — Plan d'implémentation

> Spec : `docs/superpowers/specs/2026-07-18-analyses-ia-design.md`. Web + bot. Migration `20260718000033`.

**Goal :** page `/app/analyses` (KPIs déterministes + modules IA Mistral) alimentée par un worker bot qui
génère des rapports quotidiens/hebdo/mensuels via Mistral-large. Gating Premium.

## Global Constraints

- FR, sentence case, tokens du thème, pleine largeur, responsive, cibles ≥44px. Gating **Premium**.
- **Anonymisation obligatoire** avant tout appel Mistral (aucun numéro/chat_id).
- Worker **Premium-only** ; skip propre si `MISTRAL_API_KEY` absente.
- Code client web → `@goutatou/db/types`. `aspect-4/3` (fraction) si média. `next build` avant deploy.
- **Shape partagée `AiInsights`** (bot prompt ↔ web view) :
  `{ resume_executif: string, demandes: string[], plats_preferes: string[], demandes_non_satisfaites:
  string[], faq: {question:string, reponse_suggeree:string}[], sentiment: {note:number, resume:string},
  frictions: string[], actions_marketing: string[] }`.

---

### Task AN-T1 : Migration 0033 (analysis_reports)

**Files :** Create `supabase/migrations/20260718000033_analysis_reports.sql`. Appliquer via MCP.

- [ ] Table `analysis_reports` (cf. spec § Données) + index + RLS `is_member` + `notify pgrst`.
- [ ] Appliquer via MCP, vérifier structure.

### Task AN-T2 : Bot — purs anonymize + prompt + duePeriods (TDD)

**Files :** Create `services/whatsapp/src/analysis/{anonymize.ts, prompt.ts, periods.ts}` + tests.

- [ ] `anonymize.ts` : `anonymizeMessages(rows)` — retire tél (regex), `@s.whatsapp.net`, uuid ; mappe
  rôles ; tronque à `MAX_CHARS=24000` (garde récents) + flag `truncated`. Tests : anonymisation, troncature.
- [ ] `periods.ts` : `duePeriods(nowLibreville)` → `[{type,start,end}]` (veille après 06:00, semaine ISO
  préc. le lundi, mois préc. le 1er) + `periodBoundsUtc(type, startDate)`. Tests déterministes.
- [ ] `prompt.ts` : `buildAnalysisPrompt(periodLabel, messages, headline)` → `{system, user}` FR, JSON strict,
  schéma `AiInsights`. Test : schéma + FR présents.
- [ ] `pnpm --filter @goutatou/service-whatsapp test` vert.

### Task AN-T3 : Bot — client Mistral

**Files :** Create `services/whatsapp/src/analysis/mistral.ts` (+ test parsing).

- [ ] `callMistral(apiKey, {system,user}): Promise<AiInsights>` — POST chat/completions, `mistral-large-latest`,
  `response_format json_object`, temp 0.2, timeout + 1 retry. Parse + valide (défauts vides si champ manquant).
- [ ] Test : parsing d'un payload JSON mocké → `AiInsights` valide ; JSON invalide → défauts sans crash.

### Task AN-T4 : Bot — repo + worker + câblage

**Files :** Create `services/whatsapp/src/analysis/{repo.ts, worker.ts}` ; Modify `services/whatsapp/src/index.ts`
+ la config d'env.

- [ ] `repo.ts` (client admin) : `listPremiumRestaurants`, `reportExists`, `loadConversations(start,end)`,
  `loadHeadline(start,end)` (orders/revenue/conversations SQL), `saveReport` (on conflict do nothing).
- [ ] `worker.ts` : `startAnalysisWorker(deps)` boucle périodique ; resto Premium × période due non générée →
  conversations → `anonymizeMessages` → `buildAnalysisPrompt` → `callMistral` → `saveReport`. Skip+log si pas
  de clé. Erreur par resto isolée. Throttle entre appels.
- [ ] `index.ts` : démarrage `startAnalysisWorker` + lecture `MISTRAL_API_KEY` (optionnelle).
- [ ] Typecheck + test bot verts.

### Task AN-T5 : Web — data (KPIs + rapport)

**Files :** Create `apps/web/src/app/app/analyses/analyses-data.ts` (+ test si nouveau helper).

- [ ] `getAnalyses(supabase, restaurantId, period)` → `{ kpis, previous, aiReport }` en réutilisant
  `lib/stats.ts` (orders + conversations, période + précédente) ; `aiReport` = dernier `analysis_reports`.
- [ ] Nouveau helper pur `conversionRate(chats, orders)` si besoin + test.
- [ ] Typecheck vert.

### Task AN-T6 : Web — page + vue + nav

**Files :** Create `apps/web/src/app/app/analyses/{page.tsx, analyses-view.tsx}` ; Modify `layout.tsx`,
`components/nav-links.tsx`.

- [ ] `page.tsx` (Server) : garde membre + `isPremium` (upsell homogène sinon) ; `getAnalyses(?period)` ;
  `<AnalysesView>`.
- [ ] `analyses-view.tsx` : sélecteur période (pills `<Link>`), bloc KPIs (tuiles + Δ% `pctDelta`,
  répartitions, top plats), bloc IA (résumé exécutif en avant, demandes, plats préférés, non satisfaites,
  FAQ, sentiment/frictions, 3 actions marketing) ; encart « rapport à venir » si `aiReport` absent.
- [ ] `layout.tsx` : item Analyses après Statistiques ; `nav-links.tsx` : icône `Sparkles`.
- [ ] Typecheck + `next build` verts (route `/app/analyses`).

### Task AN-T7 : Revue + déploiement

- [ ] Tests bot + web + typechecks + `next build` verts.
- [ ] Revue opus (sécurité anonymisation, gating Premium, non-régression, shape `AiInsights` cohérente
  bot↔web).
- [ ] Migration 0033 en prod (AN-T1). Merge main (Netlify web) + `railway up --service whatsapp-bot`.
- [ ] Rappel Franck : poser `MISTRAL_API_KEY` sur Railway ; 1er rapport après le passage du worker.

## Self-review

- Couverture spec : migration (T1), bot purs (T2), Mistral (T3), worker (T4), web data (T5), web UI+nav (T6),
  deploy (T7). ✓
- Interface partagée `AiInsights` définie dans les contraintes globales → bot (prompt/mistral) et web (view)
  s'y conforment. ✓
- T2/T3/T4 (bot) et T5/T6 (web) indépendants une fois la shape figée → parallélisables. ✓
- Anonymisation + Premium-only + skip sans clé = garde-fous présents. ✓
