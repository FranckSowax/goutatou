# Onboarding v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development — un implémenteur frais par tâche + revue entre chaque.

**Goal :** le gérant définit son propre mot de passe, peut le récupérer seul par WhatsApp, et est guidé à sa 1re connexion ; le scrub scroll devient premium.

**Architecture :** aucune migration. L'invitation et la récupération passent par l'API auth admin de Supabase (`generateLink`, service_role, jamais côté client) ; le lien part par le **canal Whapi du resto** (le produit n'a AUCUNE infra email — vérifié). Le démarrage guidé est **auto-déduit des données** (aucun état stocké).

**Tech Stack :** Next 15 App Router, Supabase (auth admin + RLS), `@goutatou/whapi` (envoi WhatsApp), `apps/web/src/lib/rate-limit.ts` (existant).

**Spec :** `docs/superpowers/specs/2026-07-13-onboarding-design.md` — lis-la, elle porte le raisonnement.

## Global Constraints

- **Aucune migration.** Si tu crois en avoir besoin, arrête-toi et signale-le.
- **Zéro dépendance email** : ne JAMAIS utiliser `inviteUserByEmail`/`resetPasswordForEmail` (le SMTP intégré Supabase est plafonné ~3-4/h, aucun SMTP custom n'est configuré). Utiliser `generateLink` + transport WhatsApp/copie.
- **API auth admin = service_role uniquement**, jamais exposée au client (`createAdminClient()` côté serveur).
- **Aucune énumération de comptes** : `/api/auth/recovery` répond TOUJOURS pareil (succès neutre), quel que soit le résultat réel.
- **Rate-limit** obligatoire sur la récupération (réutiliser `clientIp` + `enforceRateLimit`).
- Jamais de prop fonction Server→Client (crash RSC prod). FR partout. Tokens du thème conservés.
- Ne casse pas `createRestaurant` pour les restos existants ni le gating de plan.

---

## Task OB1 — Invitation (fin du mot de passe imposé)

**Files :** Modify `apps/web/src/app/admin/actions.ts`, `apps/web/src/app/admin/page.tsx` (formulaire de création), `apps/web/src/app/admin/restaurants/[id]/*` (bouton « Renvoyer une invitation ») ; Create `apps/web/src/app/login/definir-mot-de-passe/page.tsx`.

1. `createRestaurant` : **supprimer** `owner_password` (action + champ du formulaire). Créer l'utilisateur puis générer le lien :
   `admin.auth.admin.generateLink({ type: 'invite', email: ownerEmail, options: { redirectTo: `${BASE_URL}/login/definir-mot-de-passe` } })` → `data.properties?.action_link`.
   ⚠️ **Vérifie la forme réelle** retournée par la version du SDK installée (`@supabase/supabase-js`) : si `type:'invite'` exige que l'utilisateur n'existe pas encore, adapte (créer via `generateLink` invite directement, OU `createUser({email, email_confirm:true})` puis `generateLink({type:'recovery'})`). **Documente dans ton rapport ce que tu as réellement constaté.**
   Le reste de `createRestaurant` (restaurants, restaurant_members owner, subscriptions, whapi_channels) est **inchangé**.
2. L'action **retourne le lien** → la page de création l'affiche dans un encart avec un bouton **« Copier »**. Le lien n'est affiché qu'à ce moment (indispensable : à la création le canal Whapi n'est pas appairé → l'admin l'envoie comme il veut).
3. Fiche resto → bouton **« Renvoyer une invitation »** : régénère un lien (même mécanique) et l'affiche + Copier.
4. Bouton **« Envoyer sur WhatsApp »** (affiché seulement si `contact_phone` renseigné ET canal `status='active'`) : `new WhapiClient(token).sendText(`${digits}@s.whatsapp.net`, message FR contenant le lien)`. Best-effort : échec → message FR, le lien reste copiable.
5. `login/definir-mot-de-passe/page.tsx` (client) : le gérant arrive par le lien (Supabase pose la session) → champ mot de passe + confirmation → `supabase.auth.updateUser({ password })` → redirection `/app`. Erreurs FR. Si aucune session (lien expiré/invalide) → message FR « Lien expiré — demandez une nouvelle invitation. ».

**Tests :** pas de test unitaire (actions/pages, pattern web) → build + typecheck verts. Commit `feat(web): invitation du gérant (lien) au lieu d'un mot de passe imposé`.

---

## Task OB2 — Mot de passe oublié (self-service, par WhatsApp)

**Files :** Create `apps/web/src/app/login/mot-de-passe-oublie/page.tsx`, `apps/web/src/app/api/auth/recovery/route.ts` ; Modify `apps/web/src/lib/rate-limit.ts` (+ test), `apps/web/src/app/login/page.tsx` (lien « Mot de passe oublié ? »).

**Interfaces consommées :** `clientIp(headers)`, `enforceRateLimit(db, rules)` — **lis `rate-limit.ts`** pour la signature exacte et imite `wheelUnlockRateKeys`/`orderRateKeys`.

1. `rate-limit.ts` : ajouter `recoveryRateKeys(ip: string): RateRule[]` (quelques tentatives par IP et par heure — choisis une valeur raisonnable et commente-la). Test pur dans le fichier de test existant des helpers rate-limit.
2. `POST /api/auth/recovery` (`export const runtime = 'nodejs'`), corps `{ email }` :
   - rate-limit par IP → 429 FR + `Retry-After` si dépassé (imite `/api/roue/unlock`) ;
   - `createAdminClient()` : retrouver l'utilisateur par email (l'API admin n'a pas de `getUserByEmail` direct selon les versions — utilise ce qui existe réellement, ex. `listUsers` filtré, et **documente ton choix**), puis son `restaurant_members` → resto → `contact_phone` + `whapi_channels` actif ;
   - `generateLink({ type: 'recovery', email, options: { redirectTo: `${BASE_URL}/login/definir-mot-de-passe` } })` ;
   - envoi via `WhapiClient.sendText` sur `${digits(contact_phone)}@s.whatsapp.net`, message FR contenant le lien ;
   - **RÉPONSE TOUJOURS NEUTRE** : `{ ok: true }` — compte inexistant, `contact_phone` absent, canal HS, échec d'envoi : **le même corps**. Les échecs réels sont `console.error` côté serveur. C'est un invariant de sécurité, pas une option.
3. `login/mot-de-passe-oublie/page.tsx` (client) : champ email + bouton → POST → affiche TOUJOURS « Si ce compte existe, un lien vient d'être envoyé sur le WhatsApp du restaurant. ».
4. `/login` : ajouter le lien « Mot de passe oublié ? ».

**Tests :** `recoveryRateKeys` (pur). Build + typecheck verts. Commit `feat(web): mot de passe oublié par WhatsApp (réponse neutre + rate-limit)`.

---

## Task OB3 — Démarrage guidé (first-user, auto-déduit)

**Files :** Create `apps/web/src/lib/onboarding.ts`, `apps/web/test/onboarding.test.ts`, `apps/web/src/app/app/onboarding-card.tsx` ; Modify `apps/web/src/app/app/page.tsx`.

1. `lib/onboarding.ts` (**PUR**, TDD — écris les tests d'abord) :
```ts
export interface OnboardingState { channelReady: boolean; menuReady: boolean; orderReceived: boolean }
export interface OnboardingStep { key: 'canal' | 'carte' | 'commande'; label: string; done: boolean; href: string }
export function onboardingSteps(s: OnboardingState): OnboardingStep[]
export function onboardingProgress(s: OnboardingState): number  // 0..3
export function onboardingDone(s: OnboardingState): boolean
```
Libellés/href figés : `canal` → « Connectez votre WhatsApp » `/app/reglages` ; `carte` → « Créez votre carte » `/app/menu` ; `commande` → « Recevez votre 1re commande » `/app/commandes`. Ordre stable.
**Tests obligatoires** : aucune étape → progress 0, done false, 3 étapes non cochées ; canal+carte → progress 2, done false ; les 3 → progress 3, done true ; ordre des étapes stable ; régression (carte vidée) → done false.
2. `app/page.tsx` (accueil, Server Component) : calculer l'état — `channelReady` = `whapi_channels.status='active'` du resto ; `menuReady` = au moins 1 `menu_items` (`count exact head`) ; `orderReceived` = au moins 1 `orders` (`count exact head`). Si `!onboardingDone(...)` → monter `<OnboardingCard steps={...} progress={...} />` **en tête de page**. Ne passer QUE des données (pas de fonction).
3. `onboarding-card.tsx` : carte « Démarrez en 3 étapes » + progression (x/3), chaque étape cochée (✓) ou cliquable (`<Link href>`). Tokens du thème. Disparaît d'elle-même quand `onboardingDone` (géré côté page).

**Tests :** `onboarding.test.ts` vert + build + typecheck. Commit `feat(web): démarrage guidé en 3 étapes (auto-déduit)`.

---

## Task OB4 — Scrub scroll = premium

**Files :** Modify `apps/web/src/lib/lp/data.ts`, `apps/web/src/components/lp/Hero.tsx`.

1. `lp/data.ts` : le select actuel est `'id, slug, name, lp_config, drive_enabled, whapi_channels(phone)'` → l'étendre pour connaître le plan (`subscriptions(plan, status)`), et exposer un booléen `isPremium` dans les données de LP (plan `premium` ET `status='active'`). **Regarde `apps/web/src/lib/premium.ts`** pour la définition exacte du premium et reste cohérent.
2. `Hero.tsx:18` : la condition `frames?.status === 'ready' && frames.count > 0` gagne **`&& isPremium`**. Sinon → rendu actuel (hero image/statique) qui existe déjà = fallback naturel. Ne supprime NI le worker `lpframes` NI `HeroScrub` (ils restent pour les premium).

**Tests :** build + typecheck verts (+ test pur si tu extrais un helper). Commit `feat(web): scrub scroll de la LP réservé au premium`.

---

## Task OB5 — Revue + deploy

1. `pnpm --filter @goutatou/web test` + typecheck + build verts.
2. Revue finale (whole-branch, modèle capable) via `scripts/review-package`. Cibler : **aucune énumération de comptes** (`/api/auth/recovery` neutre sur TOUS les chemins) ; rate-limit présent ; **aucune fuite de l'API auth admin côté client** ; le lien de récupération n'est jamais loggé ni renvoyé au client ; non-régression de `createRestaurant` ; le scrub premium ne casse pas la LP des non-premium. Corriger Critical/Important en une vague.
3. Merge `feature/onboarding` → main, push. **Netlify uniquement** (aucune migration, bot inchangé → pas de Railway).
4. Ledger + mémoire.
5. Smoke Franck : créer un resto de test → copier le lien d'invitation → définir un mot de passe → arriver sur l'accueil et voir « Démarrez en 3 étapes » → tester « Mot de passe oublié » et recevoir le lien sur le WhatsApp du resto.

## Self-review (couverture spec)
- Invitation + fin du mot de passe imposé → OB1 ✓ ; page définir-mot-de-passe → OB1 ✓ ; renvoyer invitation → OB1 ✓.
- Mot de passe oublié WhatsApp + neutre + rate-limit → OB2 ✓.
- Démarrage guidé auto-déduit + réapparition si régression → OB3 ✓.
- Scrub premium + fallback existant → OB4 ✓.
- Zéro migration, zéro email → Global Constraints ✓.
- Limite assumée (canal HS → pas de reset, filet = renvoyer une invitation depuis l'admin) → OB1 (bouton) + spec ✓.
