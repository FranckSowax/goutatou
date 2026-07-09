# Rate-limiting de l'API commande web — Design

Date : 2026-07-09
Statut : validé (brainstorming)

## Problème

`POST /api/lp/[slug]/order` (apps/web/src/app/api/lp/[slug]/order/route.ts) est un
endpoint **public**, exécuté en service-role, qui pour chaque appel :
1. valide le corps, résout le restaurant par `slug` ;
2. upsert un `customer` ;
3. crée une commande via `create_order` ;
4. **envoie un message WhatsApp de confirmation** via le canal Whapi du restaurant.

Sans limitation, un acteur malveillant (ou un bug client) peut marteler cet endpoint et :
- **inonder le canal WhatsApp du restaurant → bannissement Whapi/WhatsApp** (risque le plus grave) ;
- polluer la base (`customers`, `orders`) ;
- consommer le budget d'envoi.

C'est le dernier verrou identifié avant de publier une première LP publique
(suivi `task_c730346d`). Non exploitable tant qu'aucune LP n'est publiée, mais bloquant pour la mise en ligne.

## Contrainte d'architecture

Le web tourne sur **Netlify Functions (serverless éphémère)** : les invocations
peuvent tomber sur des instances froides distinctes, donc un compteur en mémoire
(`Map`) ne limite rien de fiable. L'état de comptage doit être **partagé et durable**.

Décision : **Postgres/Supabase** — table + fonction SQL atomique, dans le pattern
maison (fonctions security-definer service-role-only : `create_order`, `spin_wheel`).
Aucune nouvelle infrastructure ; coût = 1–3 requêtes DB légères par POST.

## Architecture

### 1. Fenêtre fixe atomique (migration `20260709000013_rate_limit.sql`)

Table :
```sql
create table rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
```

Fonction :
```
hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
  returns table(allowed boolean, retry_after int)
```
- Bucket de fenêtre fixe : `window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)`.
- `insert into rate_limit_hits (key, window_start, count) values (p_key, window_start, 1)
   on conflict (key, window_start) do update set count = rate_limit_hits.count + 1
   returning count` → comptage atomique (pas de check-then-act).
- `allowed = (count <= p_limit)`.
- `retry_after = ceil(seconds jusqu'à la fin de la fenêtre)` (0 si `allowed`).
- **SECURITY DEFINER**, `revoke ... from public, anon, authenticated`, `grant execute ... to service_role`.
- **Auto-purge opportuniste** : `if random() < 0.01 then delete from rate_limit_hits where window_start < now() - interval '1 day'; end if;` — évite un cron ; la table reste petite.

RLS : la table n'est jamais lue/écrite par les clients (accès uniquement via la
fonction service-role). `enable row level security` sans policy (deny par défaut),
cohérent avec le durcissement des autres tables internes.

### 2. Trois garde-fous en couches

L'endpoint appelle `hit_rate_limit` **avant toute écriture**, dans cet ordre :

| Clé | Limite | Fenêtre | Rôle |
|---|---|---|---|
| `order:phone:<slug>:<phone>` | 3 | 600 s | double-submit / harcèlement d'un même numéro |
| `order:ip:<slug>:<ip>` | 12 | 600 s | attaquant qui cycle de faux numéros derrière une IP |
| `order:resto:<slug>` | 60 | 3600 s | **plafond dur des envois WhatsApp du canal** (anti-ban), même en attaque distribuée |

Limites définies en **constantes** dans le code (`RATE_LIMITS`), ajustables sans migration.
Les clés sont composées à partir du `slug` (stable), du `phone` validé et de l'IP.

### 3. Extraction de l'IP

`clientIp(headers)` : priorité à `x-nf-client-connection-ip` (IP réelle injectée par
Netlify), fallback sur le **premier hop** de `x-forwarded-for`, sinon `'unknown'`
(dans ce dernier cas la couche IP dégénère en un seau partagé `unknown` — les couches
phone et resto restent efficaces).

### 4. Placement dans le handler

```
parse + validateWebOrder            (inchangé)
  ↓
hit_rate_limit(phone) → 429 si bloqué
hit_rate_limit(ip)    → 429 si bloqué
hit_rate_limit(resto) → 429 si bloqué
  ↓
lookup restaurant (+ published)     (inchangé)
upsert customer / create_order / WhatsApp   (inchangé)
```

Les vérifications se font **avant** le lookup resto, l'upsert customer, `create_order`
et l'envoi WhatsApp : un flood est rejeté au coût le plus faible possible.

Réponse en cas de dépassement : **HTTP 429**, header `Retry-After: <secondes>`, corps
`{ "error": "Trop de commandes. Réessayez dans X." }` (message FR, X en secondes/minutes).

## Découpage & interfaces

Unités isolées et testables :

- **`hit_rate_limit` (SQL)** — comptage atomique fenêtre fixe. Entrée : clé, limite,
  fenêtre. Sortie : (allowed, retry_after). Testée en **pgTAP**.
- **`clientIp(headers): string`** (apps/web/src/lib/rate-limit.ts) — pure. Tests unitaires.
- **`orderRateKeys(slug, phone, ip): {key,limit,windowSeconds}[]`** (même module) — pure,
  encode les 3 couches + limites. Tests unitaires.
- **`enforceRateLimit(db, headers, slug, phone): Promise<{ ok: true } | { ok: false; retryAfter: number }>`**
  — orchestre les appels `hit_rate_limit` via le client admin ; s'arrête au premier blocage.
- **route.ts** — câble `enforceRateLimit` puis renvoie 429 le cas échéant ; reste inchangé sinon.

## Gestion des erreurs

- Échec DB de `hit_rate_limit` (indispo Postgres) : **fail-open** — on log l'erreur et on
  laisse passer la commande. Justification : mieux vaut accepter une commande légitime que
  bloquer tout le service sur un incident DB ; le plafond resto reste le garde-fou principal
  côté WhatsApp et une panne Postgres bloquerait de toute façon `create_order` juste après.
  (Décision explicite ; alternative fail-closed écartée pour ne pas coupler la disponibilité
  du checkout à ce sous-système.)
- `retry_after` toujours ≥ 1 quand bloqué.

## Tests

- **pgTAP** : sous la limite → allowed ; au-delà → bloqué + retry_after > 0 ; fenêtre
  suivante → reset ; deux clés distinctes n'interfèrent pas.
- **Unitaires web** : `clientIp` (nf-header prioritaire, fallback xff 1er hop, unknown) ;
  `orderRateKeys` (3 couches, bonnes limites/fenêtres, composition des clés).
- **Suite existante** (db/whapi/bot/web) : rester verte.

## Hors scope (YAGNI)

- Redis/Upstash, captcha, blocage IP persistant, configuration par resto en base.
- `/api/roue/spin` (déjà protégé par token HMAC à usage unique) — la fonction
  `hit_rate_limit` étant générique, réutilisation triviale dans un lot ultérieur si besoin.

## Déploiement

- Migration `0013` à appliquer en prod (via MCP Supabase si reconnecté, sinon SQL Editor manuel).
- Web : auto-deploy Netlify au merge sur `main`. Aucune variable d'environnement nouvelle.
- Bot Railway : non concerné (endpoint web uniquement).
