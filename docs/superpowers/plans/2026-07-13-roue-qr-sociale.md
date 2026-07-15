# Roue QR + action sociale (Fidélité v3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development — un implémenteur frais par tâche + revue entre chaque.

**Goal :** remplacer le déclenchement « après N commandes » de la roue par un **flux public QR → action sociale → 1 tour par numéro/période**, en portant l'UX de cartelle sur le socle sécurisé Goutatou.

**Architecture :** la page publique `/roue/[restaurantId]` (roue SVG jouable portée de cartelle) n'écrit JAMAIS en base : elle appelle `/api/roue/unlock` (serveur, vérifie l'éligibilité par numéro et émet un jeton HMAC) puis `/api/roue/spin` (existant, tirage serveur `spin_wheel` atomique). Le cooldown est vérifié côté serveur par NUMÉRO, jamais par localStorage.

**Tech Stack :** Next 15 App Router (web), Supabase (RLS + `spin_wheel` SECURITY DEFINER), `@goutatou/db/wheel` (HMAC), `@goutatou/whapi` (envoi du gain), `lib/qr.ts` (`qrSvg`).

## Global Constraints

- Migration `20260713000028`, `notify pgrst, 'reload schema'` après DDL.
- **Aucune écriture publique** : la page publique ne fait AUCUN `insert`/`update` Supabase ; tout passe par des routes serveur `service_role`. Ne JAMAIS créer de policy `FOR INSERT TO public WITH CHECK (true)` (anti-pattern cartelle).
- **Tirage serveur uniquement** : `spin_wheel` via `/api/roue/spin`. Jamais de `Math.random()` décidant le lot côté client (le client n'anime QUE vers le segment renvoyé par le serveur).
- **Éligibilité = 1 tour / numéro / `wheel_spin_period_days`** (défaut 30) : `exists(wheel_spins where customer_id=X and created_at >= now() - period)` — **sans filtre sur `source`** (fail-safe : sur-bloque plutôt que sous-bloque ; ne dépend d'aucune écriture annexe). Vérifiée à `/api/roue/unlock` ET ré-vérifiée à `/api/roue/spin` (autoritaire).
- Action sociale = **déclarative** (honor-system) : compte à rebours **25 s** avant d'activer « J'ai terminé ». Aucune vérification de l'action.
- Numéro = **opt-in marketing implicite** : client upserté avec `marketing_opt_in=true`, `opted_out=false`, case pré-cochée + mention STOP.
- `wheel_qr_public=true` **désactive** le trigger commandes ; `false` → comportement v2 **inchangé** (non-régression stricte).
- QR : réutiliser `apps/web/src/lib/qr.ts` `qrSvg` — **pas** de dépendance `qrcode`.
- FR partout, copies figées. Jamais de prop fonction Server→Client.

---

## Task RQ1 — Migration 0028 + types + helpers purs

**Files :**
- Create : `supabase/migrations/20260713000028_roue_qr_sociale.sql`
- Create : `apps/web/src/lib/wheel-geometry.ts`, `apps/web/src/lib/wheel-eligibility.ts`
- Create : `apps/web/test/wheel-geometry.test.ts`, `apps/web/test/wheel-eligibility.test.ts`
- Modify : `packages/db/src/types.ts`

**Migration** (idempotente, exactement) :
```sql
alter table restaurants add column if not exists wheel_qr_public boolean not null default false;
alter table restaurants add column if not exists wheel_google_url text;
alter table restaurants add column if not exists wheel_tiktok_url text;
alter table restaurants add column if not exists wheel_channel_url text;
alter table restaurants add column if not exists wheel_action_google boolean not null default false;
alter table restaurants add column if not exists wheel_action_tiktok boolean not null default false;
alter table restaurants add column if not exists wheel_action_channel boolean not null default false;
alter table restaurants add column if not exists wheel_spin_period_days int not null default 30;

alter table wheel_spins add column if not exists declared_action text
  check (declared_action in ('google','tiktok','channel'));
alter table wheel_spins add column if not exists source text not null default 'order'
  check (source in ('order','qr_public'));

notify pgrst, 'reload schema';
```
Ne PAS appliquer en prod (RQ5).

**`packages/db/src/types.ts`** : `export type WheelAction = 'google' | 'tiktok' | 'channel'` ; `export type WheelSpinSource = 'order' | 'qr_public'`.

**`apps/web/src/lib/wheel-geometry.ts`** (PUR, porté de cartelle `app/spin/[shopId]/page.tsx`) :
```ts
export interface WheelSeg { key: string; label: string; kind: 'prize' | 'lose' | 'retry'; color: string; imageUrl?: string | null }

/** Angle de rotation total pour amener le centre du segment `index` sous le pointeur (haut).
 *  `rand` (0..1) injecté (jamais Math.random ici) → testable. `current` = rotation actuelle (deg). */
export function targetRotation(index: number, total: number, current: number, rand: number): number {
  const segmentAngle = 360 / total
  const segmentCenterAngle = index * segmentAngle + segmentAngle / 2 - 90
  const randomOffset = (rand - 0.5) * segmentAngle * 0.6
  const targetAngle = -segmentCenterAngle - 90 + randomOffset
  const distToTarget = (((targetAngle - (current % 360)) % 360) + 360) % 360
  const extraSpins = 5
  return current + extraSpins * 360 + distToTarget
}

/** Path SVG d'un secteur (viewBox 0 0 400 400, centre 200,200). */
export function segmentPath(index: number, total: number, outerRadius: number, innerRadius: number): string

/** Répartit les segments pour éviter deux voisins de même `kind` (porté de WheelPreview.distributeSegments). */
export function distributeSegments(segs: WheelSeg[]): WheelSeg[]
```

**`apps/web/src/lib/wheel-eligibility.ts`** (PUR) :
```ts
/** `lastSpinAt` = date du dernier tour du client (null = jamais). Renvoie l'éligibilité et,
 *  si bloqué, la date à partir de laquelle il pourra rejouer. periodDays <= 0 → toujours éligible. */
export function checkEligibility(lastSpinAt: Date | null, periodDays: number, now: Date):
  { eligible: true } | { eligible: false; nextEligibleAt: Date }
```

**Tests (TDD)** :
- `targetRotation` : total=8, index=0, current=0, rand=0.5 → rotation = 5*360 + distToTarget attendu (calcule la valeur exacte et assert) ; rand=0/1 → offset borné dans ±0.3*segmentAngle ; rotation toujours > current (jamais en arrière).
- `distributeSegments` : 3 prize + 3 lose → aucun voisin de même kind (vérifier aussi le wrap dernier↔premier quand possible) ; entrée vide → vide.
- `segmentPath` : renvoie une chaîne commençant par `M` et contenant `A` (arc) ; total=4 → 4 chemins distincts.
- `checkEligibility` : lastSpinAt null → eligible ; il y a 10 j avec period 30 → bloqué + nextEligibleAt = lastSpinAt+30j ; il y a 40 j → eligible ; periodDays=0 → eligible.

Vérifie : `pnpm --filter @goutatou/web test` + typecheck verts. Commit `feat(web,db): migration 0028 + helpers roue QR`.

---

## Task RQ2 — API : unlock + spin étendu

**Files :**
- Create : `apps/web/src/app/api/roue/unlock/route.ts`
- Modify : `apps/web/src/app/api/roue/spin/route.ts`
- Create : `apps/web/src/lib/wheel-phone.ts` + `apps/web/test/wheel-phone.test.ts`

**Interfaces consommées** : `checkEligibility` (RQ1) ; `signWheelToken({rid,cid,jti,ttlSec}, secret, nowSec)` et `verifyWheelToken(token, secret, nowSec) → {rid,cid,jti,exp}|null` de `@goutatou/db/wheel` ; RPC `spin_wheel(p_restaurant_id, p_customer_id, p_jti)` → `(prize_id,label,code,outcome,expires_at)`.

**`wheel-phone.ts`** (PUR) :
```ts
/** Normalise un numéro saisi en chiffres seuls (indicatif inclus). Renvoie null si invalide
 *  (moins de 8 chiffres ou plus de 15). */
export function normalizePhone(raw: string): string | null
```
Tests : `'+241 05 52 65 22'` → `'24105526522'` ; `'06 12'` → null ; 20 chiffres → null.

**`/api/roue/unlock`** (POST, `runtime = 'nodejs'`) — corps `{ restaurantId, phone, action }` :
1. Valide `action ∈ {'google','tiktok','channel'}` sinon 400 « Action invalide. ».
2. `normalizePhone(phone)` → null → 400 « Numéro invalide. ».
3. `createAdminClient()` : charge le restaurant (`wheel_qr_public, wheel_spin_period_days, wheel_action_google/tiktok/channel`). Si introuvable OU `wheel_qr_public !== true` → 404 « Roue indisponible. ». Si l'action demandée n'est pas activée → 400 « Action indisponible. ».
4. **Upsert client par téléphone** : cherche `customers` par `restaurant_id` + `phone`; sinon insert `{ restaurant_id, phone, chat_id: `${phone}@s.whatsapp.net`, name: null, marketing_opt_in: true, opted_out: false }`. (Si le client existe et `opted_out=true`, le remettre à `marketing_opt_in=true, opted_out=false` — il redonne son numéro volontairement.)
5. **Éligibilité** : dernier `wheel_spins` du client (`order by created_at desc limit 1`) → `checkEligibility(lastSpinAt, periodDays, now)`. Bloqué → 409 `{ error: 'Vous avez déjà tourné. Revenez le <date FR>.', nextEligibleAt }`.
6. `signWheelToken({ rid: restaurantId, cid: customer.id, jti: `qr:${crypto.randomUUID()}`, ttlSec: 600 }, process.env.WHEEL_JWT_SECRET, nowSec)` → 200 `{ token }`. `WHEEL_JWT_SECRET` absent → 500 « Configuration manquante. » (log).

**`/api/roue/spin`** (modifs additives, non-régression stricte du flux v2) :
- Après `verifyWheelToken` et AVANT le RPC : **si `claims.jti` commence par `qr:`** → ré-vérifier l'éligibilité (dernier spin du client + période du restaurant) ; bloqué → 409 « Vous avez déjà tourné. ». (Les jetons v2 `order` ne passent pas par ce contrôle → zéro régression.)
- Après un RPC réussi : best-effort `update wheel_spins set source='qr_public', declared_action=<action>` pour la ligne du `jti` — **stat uniquement**, un échec est logué et n'affecte rien (l'éligibilité ne dépend pas de `source`). L'action est transmise dans le corps du POST : `{ t, action? }`.
- Le reste (retry, envoi WhatsApp du gain, réponses) **inchangé**.

**Tests** : `wheel-phone.test.ts` (ci-dessus). Les routes ne sont pas testées unitairement (pattern web existant) → build + typecheck verts. Commit `feat(web): API unlock roue QR + spin gardé par numéro`.

---

## Task RQ3 — Page publique `/roue/[restaurantId]`

**Files :**
- Create : `apps/web/src/app/roue/[restaurantId]/page.tsx` (server, charge la config publique)
- Create : `apps/web/src/app/roue/[restaurantId]/qr-wheel.tsx` (client — orchestre actions → unlock → spin → animation)
- Create : `apps/web/src/app/roue/[restaurantId]/wheel-svg.tsx` (client — roue SVG portée de cartelle)
- Create : `apps/web/src/app/roue/[restaurantId]/use-confetti.ts` (client — hook confetti porté)

**Interfaces consommées** : `targetRotation`, `segmentPath`, `distributeSegments`, `WheelSeg` (RQ1) ; routes `/api/roue/unlock` et `/api/roue/spin` (RQ2).

**`page.tsx`** (Server Component) : charge via client Supabase serveur le restaurant (`name, wheel_qr_public, wheel_action_*, wheel_google_url, wheel_tiktok_url, wheel_channel_url, wa_channel_invite`) + les lots actifs (`prizes` : `id,name,image_url` + poids) et les poids unlucky/retry. Si `wheel_qr_public !== true` → page « Roue indisponible. ». Construit les `WheelSeg[]` (prize/lose/retry, couleurs de la palette Goutatou) + `distributeSegments`, passe **les données seulement** (aucune fonction) à `<QrWheel>`.

**`wheel-svg.tsx`** : `{ segments: WheelSeg[]; rotation: number; spinning: boolean }` → SVG viewBox `0 0 400 400`, un `<path d={segmentPath(i, total, 190, 60)}>` par segment + label (texte tronqué/multi-lignes) + image de lot optionnelle, pointeur en haut, anneau de LED décoratif. `style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 5.2s cubic-bezier(0.1,0.6,0.15,1)' : 'none' }}`.

**`qr-wheel.tsx`** (client) — machine d'états locale :
1. `idle` : roue immobile + liste des **actions activées** (bouton par action avec son lien). Clic → `window.open(url, '_blank')` + passe en `waiting` avec un **countdown 25 s** (`setInterval`), bouton « J'ai terminé » désactivé jusqu'à 0.
2. `form` : champ **téléphone** (placeholder `+241 …`) + **case opt-in pré-cochée** (« J'accepte de recevoir mon gain et les offres du restaurant — STOP pour me désabonner ») + bouton « Tourner ! ».
3. Submit → POST `/api/roue/unlock` `{restaurantId, phone, action}` → 409 → affiche le message FR (« déjà tourné, revenez le … ») ; 200 → POST `/api/roue/spin` `{t: token, action}`.
4. Réponse spin : trouve l'index du segment correspondant (`outcome==='prize'` → segment du `prizeId` ; `lose` → un segment `lose` ; `retry` → un segment `retry`), `setRotation(targetRotation(index, total, rotation, Math.random()))`, `spinning=true`, puis après 5,2 s affiche le résultat (`prize` → label + code + « envoyé sur WhatsApp », confetti ; `lose` → message ; `retry` → bouton « Rejouer » qui rappelle `/api/roue/spin` avec le `retryToken`).
   `Math.random()` ici ne sert QU'À l'esthétique de l'angle — **le lot vient du serveur**.
5. Erreurs réseau → message FR générique.

**`use-confetti.ts`** : hook canvas 2D porté (DPR-aware, cap particules), `fire()` au gain.

**Tests** : composants non testés unitairement (pattern web) ; les helpers sont couverts en RQ1. Build + typecheck verts. Commit `feat(web): page publique roue QR + actions sociales`.

---

## Task RQ4 — Admin `/app/fidelite` : preview + section QR

**Files :**
- Create : `apps/web/src/app/app/fidelite/wheel-preview.tsx` (client — preview portée de cartelle)
- Create : `apps/web/src/app/app/fidelite/qr-section.tsx` (client)
- Modify : `apps/web/src/app/app/fidelite/actions.ts`, `page.tsx`

**`wheel-preview.tsx`** : rend la roue (réutilise `segmentPath`/`distributeSegments` de RQ1) à partir des lots + poids courants — visualisation immobile de ce que verra le client.

**`qr-section.tsx`** + action `updateWheelQrSettings(formData)` :
- toggle `wheel_qr_public` (libellé : « Active la roue par QR — remplace le déclenchement après N commandes ») ;
- 3 blocs : interrupteur `wheel_action_google|tiktok|channel` + champ lien `wheel_google_url|wheel_tiktok_url|wheel_channel_url`. Le champ chaîne est pré-rempli avec `wa_channel_invite` s'il est vide.
- champ `wheel_spin_period_days` (entier ≥ 0 ; 0 = illimité) ;
- **QR imprimable** : `qrSvg(`${baseUrl}/roue/${restaurantId}`)` rendu côté serveur dans `page.tsx` et passé en prop `svg: string` au composant client (jamais de fonction en prop), + bouton « Imprimer ».
- Validation serveur : si `wheel_qr_public` est activé, au moins une action doit être activée ET son lien renseigné, sinon throw « Activez au moins une action avec son lien. ». Lien : doit commencer par `http`.
- Gating : garde membre + plan (réutiliser le helper réel déjà utilisé dans `fidelite/actions.ts`).

**`page.tsx`** : monter `<WheelPreview>` et `<QrSection>` ; quand `wheel_qr_public` est actif, masquer/désactiver le réglage « déclenchement après N commandes » (`wheel_trigger_orders`) avec la mention « Remplacé par la roue QR ».

**Tests** : build + typecheck verts. Commit `feat(web): admin roue QR (preview, actions, période, QR imprimable)`.

---

## Task RQ5 — Revue + prod + deploy + smoke

1. `pnpm -w test` (web + bot + whapi) + builds verts.
2. Revue finale (whole-branch, modèle capable) via review-package. Cibler : **aucune écriture publique / aucun tirage client** (le lot vient toujours du serveur) ; éligibilité par numéro vérifiée à unlock ET spin ; non-régression stricte du flux v2 (jetons `order`, trigger commandes quand `wheel_qr_public=false`) ; multi-tenant (unlock ne peut pas cibler un autre resto) ; opt-in correctement posé. Corriger Critical/Important en une vague.
3. Migration 0028 prod via MCP Supabase de service + `notify pgrst` + round-trip (colonnes lisibles).
4. Merge `feature/roue-qr-sociale` → main, push. Netlify auto. (Railway seulement si le bot a changé — a priori non.)
5. Ledger + mémoire.
6. Smoke Franck : `/app/fidelite` → activer Roue QR + 1-3 actions + liens + période, imprimer le QR ; scanner → faire une action → attendre 25 s → « J'ai terminé » → numéro → tourner → recevoir le gain sur WhatsApp ; re-scanner même numéro → refus « déjà tourné ».

## Self-review (couverture spec)
- QR public + actions + countdown 25 s → RQ3 ✓ ; config admin + QR imprimable → RQ4 ✓.
- 1 tour/numéro/période (serveur, unlock + spin) → RQ2 ✓ (helper RQ1).
- Opt-in implicite → RQ2 (upsert) + RQ3 (case pré-cochée) ✓.
- Remplace trigger commandes (`wheel_qr_public`) → RQ1 (colonne) + RQ4 (UI) ✓ ; non-régression si false → RQ2/RQ4 ✓.
- Tirage serveur + aucune écriture publique → RQ2/RQ3 (contraintes globales) ✓.
- UX cartelle (roue SVG, angle cible, distributeSegments, confetti, preview) → RQ1/RQ3/RQ4 ✓.
- QR via `qrSvg` existant (pas de dep) → RQ4 ✓.
- Backlog (hors v1) : weekly_schedule, bonus engagement, race étroite double-unlock (documentée, conséquence = 1 tour en trop).
