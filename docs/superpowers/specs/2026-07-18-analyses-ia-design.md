# Spec — Page Analyses (KPIs + analyses IA Mistral)

Date : 2026-07-18. Migration `20260718000033`. Touche **web** (page + KPIs) **et bot** (worker de
génération planifiée + client Mistral). Gating **Premium**.

## Intention

Une page `/app/analyses` (sous Statistiques) qui « lit » un restaurant d'un coup d'œil et alimente une
stratégie marketing :
1. **KPIs déterministes** (jour/semaine/mois, comparés à la période précédente) — commandes + conversations.
2. **Analyses IA** (Mistral-large) sur les conversations : demandes/attentes, plats préférés, demandes non
   satisfaites, FAQ, sentiment/frictions, résumé exécutif + 3 actions marketing.
3. **Rapports périodiques** générés **automatiquement** (quotidien/hebdo/mensuel) par un worker bot et archivés.

## Décisions produit (validées)

- **Génération automatique planifiée** (pas de bouton à la demande en v1) — worker bot, comme les workers
  statuts/sondages existants.
- **Livraison tout-en-un** : KPIs + IA dans le même chantier.
- **Modèle `mistral-large-latest`**.
- **Anonymisation** : le contenu des messages part chez Mistral SANS numéros/chat_id/identifiants.
- **Gating Premium** (`isPremium`), comme les campagnes.

## Architecture

- **Web** (`/app/analyses`) : Server Component. Calcule les **KPIs en direct** (réutilise `lib/stats.ts`)
  pour la période sélectionnée + comparaison ; charge le **dernier rapport IA** stocké pour ce type de
  période et affiche les modules. Sélecteur jour/semaine/mois (`?period=`) + historique.
- **Bot** (`services/whatsapp`) : un worker `startAnalysisWorker` (boucle périodique, comme les autres)
  génère les rapports **dus** pour chaque resto **Premium**, appelle Mistral, stocke le résultat.
- **Table `analysis_reports`** : archive des insights IA (le worker), lue par la page.

> **Prérequis déploiement** : `MISTRAL_API_KEY` dans les variables Railway (bot). Sans elle, le worker
> saute la génération (log), les KPIs de la page fonctionnent, les modules IA affichent « rapport à venir ».

## Données (migration 0033)

```sql
create table public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_type text not null check (period_type in ('day','week','month')),
  period_start date not null,   -- 1er jour civil (Libreville) de la période couverte
  period_end date not null,
  headline jsonb not null default '{}'::jsonb,   -- chiffres clés archivés (orders, revenue…)
  ai_insights jsonb not null default '{}'::jsonb, -- sortie structurée Mistral
  model text,
  generated_at timestamptz not null default now(),
  unique (restaurant_id, period_type, period_start)
);
create index on public.analysis_reports(restaurant_id, period_type, period_start desc);

alter table public.analysis_reports enable row level security;
create policy tenant_all_analysis_reports on public.analysis_reports for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
notify pgrst, 'reload schema';
```

Le worker écrit via le **client admin** (service_role) du bot (pas de session utilisateur). La page lit via
le client authentifié (RLS).

## Part A — Bot : client Mistral + prompt + anonymisation (purs, testés)

**Files :** `services/whatsapp/src/analysis/{mistral.ts, prompt.ts, anonymize.ts}` (+ tests des purs).

- **`anonymize.ts`** (PUR, testé) : `anonymizeMessages(rows: {direction, body}[]): {role, text}[]` — retire
  numéros de téléphone (regex Gabon/international), `@s.whatsapp.net`, tout chat_id/uuid ; mappe
  `direction 'in'→'client'`, `'out'→'bot'` ; ignore les `body` vides ; tronque à un budget
  (`MAX_CHARS` ~ 24000, en gardant les plus récents) et renvoie un flag `truncated`.
- **`prompt.ts`** (PUR, testé) : `buildAnalysisPrompt(period, messages, headline): { system, user }` —
  consigne FR, demande une **sortie JSON stricte** avec le schéma :
  `{ resume_executif: string, demandes: string[], plats_preferes: string[], demandes_non_satisfaites:
  string[], faq: {question, reponse_suggeree}[], sentiment: {note: number, resume: string}, frictions:
  string[], actions_marketing: string[] }`. Insiste : répondre uniquement en JSON, en français, ne rien
  inventer si peu de données (listes vides), 3 actions marketing max.
- **`mistral.ts`** : `callMistral(apiKey, {system, user}): Promise<AiInsights>` — POST
  `https://api.mistral.ai/v1/chat/completions`, `model: 'mistral-large-latest'`,
  `response_format: { type: 'json_object' }`, `temperature: 0.2`, timeout + 1 retry. Parse + valide le JSON
  (garde-fous : champs manquants → défauts vides). Best-effort : toute erreur remonte pour être loggée par
  le worker (pas de crash).

## Part B — Bot : worker de génération planifiée

**Files :** `services/whatsapp/src/analysis/{repo.ts, worker.ts}` ; Modify `services/whatsapp/src/index.ts`
(démarrage), config (`MISTRAL_API_KEY`).

- **`repo.ts`** (client admin) :
  - `listPremiumRestaurants()` → restos au plan `premium` actif.
  - `duePeriods(now)` (PUR, testé) : à partir de « maintenant » (Libreville), renvoie les périodes à générer :
    - `day` = la veille (générée après 06:00 Libreville) ;
    - `week` = la semaine ISO précédente (lun→dim), générée le lundi ;
    - `month` = le mois précédent, généré le 1er.
  - `reportExists(restaurantId, periodType, periodStart)` → idempotence.
  - `loadConversations(restaurantId, startUtc, endUtc)` → `message_logs` (direction, body) de la période.
  - `loadHeadline(restaurantId, startUtc, endUtc)` → `{ orders, revenue, conversations }` (agrégats SQL
    simples — pas besoin de `stats.ts` côté bot).
  - `saveReport(row)` → upsert `on conflict (restaurant_id,period_type,period_start) do nothing`.
- **`worker.ts`** : `startAnalysisWorker(deps)` — boucle (~toutes les 30–60 min, aligné sur les workers
  existants). Pour chaque resto Premium × chaque période due non encore générée : charge conversations +
  headline → `anonymizeMessages` → `buildAnalysisPrompt` → `callMistral` → `saveReport`. Si
  `MISTRAL_API_KEY` absente → skip + log (fonctionnalité additive). Chaque resto est indépendant (une
  erreur n'arrête pas les autres). Throttle léger entre appels (coût/rate-limit Mistral).
- **`index.ts`** : `startAnalysisWorker(...)` au démarrage, garde-fou si clé absente. Ajouter `MISTRAL_API_KEY`
  à la config d'environnement.

## Part C — Web : page `/app/analyses`

**Files :** Create `apps/web/src/app/app/analyses/{page.tsx, analyses-view.tsx, analyses-data.ts}` ;
Modify `apps/web/src/app/app/layout.tsx` (nav), `apps/web/src/components/nav-links.tsx` (icône `Sparkles`).

- **`analyses-data.ts`** : `getAnalyses(supabase, restaurantId, period)` →
  `{ kpis, previous, aiReport }`.
  - **KPIs** (déterministes, via `lib/stats.ts`) pour la période courante + précédente : orders (nb, CA,
    panier moyen), `modeSplit`, `sourceSplit`, `topItems`, `cancelRate`, `hourHistogram`/`weekdayCa`,
    conversations (nb chats, messages, **taux de conversion** = chats ayant abouti à une commande /
    chats, nouveaux vs récurrents via `newVsReturning`, clients inactifs).
  - **aiReport** : dernier `analysis_reports` pour `(restaurantId, period_type=period)`.
- **`page.tsx`** (Server) : garde membre + `isPremium`. Non-premium → carte d'upsell homogène. Sinon charge
  `getAnalyses` selon `?period=` (défaut `week`) et rend `<AnalysesView>`.
- **`analyses-view.tsx`** (présentation, données only) : sélecteur de période (pills jour/semaine/mois,
  `<Link>` `?period=`), **bloc KPIs** (tuiles avec Δ% coloré via `pctDelta`, mini-répartitions, top plats),
  **bloc IA** (cartes : Résumé exécutif en avant, Demandes & attentes, Plats préférés, Demandes non
  satisfaites, FAQ, Sentiment & frictions, **3 actions marketing** mises en avant). Si `aiReport` absent →
  encart « Analyse IA en préparation — le prochain rapport {période} sera généré automatiquement ». Pleine
  largeur, cartes `rounded-2xl`, tokens du thème, responsive.

## Part D — Navigation

- `layout.tsx` : item `{ href: '/app/analyses', label: 'Analyses', icon: 'Sparkles', match: '/app/analyses' }`
  **juste après Statistiques**. Le séparateur reste sous Conversations.
- `nav-links.tsx` : importer `Sparkles` (lucide) + l'ajouter à `ICONS`.

## Confidentialité / sécurité

- **Anonymisation avant Mistral** : jamais de numéro/chat_id/identifiant dans le prompt (testé). Seul le
  contenu des messages transite. À documenter côté produit (le resto envoie ses conversations à un tiers).
- Worker Premium-only → pas d'appel Mistral (coût) pour les restos non payants.
- RLS `is_member` sur `analysis_reports` ; la page lit uniquement le resto du membre. Worker via service_role.
- `MISTRAL_API_KEY` uniquement côté bot (Railway), jamais exposée au client.
- Cap de volume + troncature → coût/latence maîtrisés ; garde-fous de parsing JSON (jamais de crash).

## Tests

- Purs (bot) : `anonymizeMessages` (retire numéros/chat_id, troncature, mapping rôles), `buildAnalysisPrompt`
  (schéma présent, FR, JSON demandé), `duePeriods` (veille/ semaine ISO préc./ mois préc., idempotence des
  bornes). `callMistral` non testé en réel (dépend clé/réseau) → parsing testé sur un payload mocké.
- Purs (web) : réutilise les tests `stats.ts` existants ; ajouter le calcul du **taux de conversion** si
  nouveau helper.
- Global : `pnpm -w test` + typechecks + `next build` verts. Bot `pnpm --filter @goutatou/service-whatsapp test`.

## Hors périmètre (v1)

- Bouton « générer à la demande » (v1 = automatique planifié uniquement).
- Export PDF des rapports ; notifications WhatsApp du rapport au gérant.
- Analyse multimodale (photos), analyse par client individuel.

## Déploiement

Migration 0033 via MCP + `notify pgrst`. Web (Netlify) + bot (`railway up --service whatsapp-bot`). Franck
pose `MISTRAL_API_KEY` sur Railway. Premier rapport visible après le 1er passage du worker une fois la clé en
place. Smoke : /app/analyses (Premium) → KPIs de la semaine + (après génération) modules IA ; non-premium →
upsell.
