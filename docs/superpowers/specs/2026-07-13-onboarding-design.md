# Spec — Onboarding v2 (invitation, récupération, démarrage guidé)

Date : 2026-07-13. Branche : `feature/onboarding`. **Aucune migration** (chantier web pur).

## Constat (mesuré dans le code, pas supposé)

Parcours actuel d'un nouveau resto :
- **Aucune inscription publique.** Seul point d'entrée : `/admin` (réservé `platform_admins`), action `createRestaurant`
  (`apps/web/src/app/admin/actions.ts:16`). Modèle sales-led assumé.
- **L'admin choisit le mot de passe du gérant** : le formulaire exige `owner_password`, puis
  `admin.auth.admin.createUser({ email, password, email_confirm: true })`. Conséquences : l'admin
  **connaît** le mot de passe, aucun changement forcé, email jamais vérifié.
- **Aucun « mot de passe oublié »** (vérifié : rien dans `/login`). Un gérant qui oublie est bloqué et
  doit appeler l'équipe, qui n'a même pas d'UI pour le réinitialiser (passage par Supabase à la main).
- **Rien ne guide le gérant** à sa 1re connexion : il arrive sur une app vide (ni carte, ni canal).
- **Zéro infrastructure email** dans le produit : aucun SMTP/Resend/SendGrid (`grep` exhaustif). Le SMTP
  intégré Supabase est plafonné (~3-4 envois/h, usage test) → **on ne peut pas bâtir sur l'email**.
- **En revanche le canal existe** : chaque resto a un canal Whapi actif + `restaurants.contact_phone`.
  Le produit sait se joindre lui-même.

## Décisions (validées par Franck)

1. **Invitation** au lieu d'un mot de passe imposé (le gérant définit le sien).
2. **Mot de passe oublié en self-service, lien envoyé sur WhatsApp** (canal du resto), avec réponse
   neutre + rate-limit. **+ bouton admin de secours** non retenu explicitement → self-service WhatsApp
   uniquement pour la v1 (l'admin garde le lien d'invitation copiable comme filet).
3. **Démarrage guidé** à la 1re connexion, étapes **auto-déduites des données** (aucun état stocké).
4. **Scrub scroll = option premium** (la LP reste légère par défaut).

## 1. Invitation (remplace le mot de passe imposé)

`apps/web/src/app/admin/actions.ts` — `createRestaurant` :
- **Retirer** le champ `owner_password` (formulaire + action).
- Créer l'utilisateur **sans mot de passe** puis générer un lien d'invitation :
  `admin.auth.admin.generateLink({ type: 'invite', email: ownerEmail, options: { redirectTo: <BASE_URL>/login/definir-mot-de-passe } })`
  → renvoie `properties.action_link`. (Alternative si l'API l'impose : `createUser({ email, email_confirm: true })`
  puis `generateLink({ type: 'recovery', ... })` — l'implémenteur vérifiera la forme réelle retournée
  par la version du SDK et documentera ce qu'il a constaté.)
- **Le lien est RENDU à l'admin** (page de création → affichage du lien + bouton « Copier »), pas envoyé
  automatiquement : à la création, le canal Whapi du resto n'est pas encore appairé (poule/œuf) → l'admin
  l'envoie comme il veut (WhatsApp perso, SMS, oral).
- Bouton **« Envoyer sur WhatsApp »** (optionnel, si `contact_phone` renseigné ET canal actif) : envoie le
  lien au gérant via `WhapiClient.sendText` sur le canal du resto.
- **Le lien n'est affiché qu'une fois** (à la création). Un bouton **« Renvoyer une invitation »** sur la
  fiche resto régénère un lien à la demande (même mécanique).

`apps/web/src/app/login/definir-mot-de-passe/page.tsx` (nouveau) : page où le gérant, arrivé par le lien
(session posée par Supabase), saisit **son** mot de passe → `supabase.auth.updateUser({ password })` →
redirection `/app`.

## 2. Mot de passe oublié (self-service, par WhatsApp)

`apps/web/src/app/login/mot-de-passe-oublie/page.tsx` (nouveau) : champ email + bouton.

`POST /api/auth/recovery` (nouveau, `runtime = 'nodejs'`) :
1. **Rate-limit** par IP via l'infra existante (`clientIp` + `enforceRateLimit`, `apps/web/src/lib/rate-limit.ts`)
   — ajouter une règle `recoveryRateKeys(ip)` (quelques tentatives/heure). 429 FR si dépassé.
2. Cherche l'utilisateur par email (service_role) → son `restaurant_members` → le resto → `contact_phone`
   + canal Whapi actif.
3. Génère `admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: <BASE_URL>/login/definir-mot-de-passe } })`.
4. Envoie le lien **sur le WhatsApp du resto** (`sendText(contact_phone@s.whatsapp.net, …)`).
5. **Réponse TOUJOURS neutre** : `{ ok: true }` + message « Si ce compte existe, un lien vient d'être
   envoyé sur le WhatsApp du restaurant. » — **quel que soit le résultat** (compte inexistant, pas de
   `contact_phone`, canal HS, échec d'envoi). Aucune énumération de comptes possible. Les échecs réels
   sont logués côté serveur (`console.error`).

**Limite assumée et documentée** : si le canal Whapi du resto est HS ou `contact_phone` absent, le gérant
ne reçoit rien et doit contacter l'équipe (qui régénère une invitation depuis la fiche resto). C'est le
filet.

## 3. Démarrage guidé (first-user)

`apps/web/src/lib/onboarding.ts` (nouveau, **pur** + testé) :
```ts
export interface OnboardingState { channelReady: boolean; menuReady: boolean; orderReceived: boolean }
export function onboardingSteps(s: OnboardingState): { key: string; label: string; done: boolean; href: string }[]
export function onboardingDone(s: OnboardingState): boolean   // les 3 étapes faites
export function onboardingProgress(s: OnboardingState): number // 0..3
```
Étapes (libellés figés) :
1. **« Connectez votre WhatsApp »** → `/app/reglages` (ou fiche admin si c'est l'équipe qui appaire) —
   `channelReady` = canal Whapi du resto `status = 'active'`.
2. **« Créez votre carte »** → `/app/menu` — `menuReady` = au moins 1 `menu_items` pour le resto.
3. **« Recevez votre 1re commande »** → `/app/commandes` — `orderReceived` = au moins 1 `orders`.

`apps/web/src/app/app/page.tsx` (accueil) : si `!onboardingDone(...)`, afficher **en tête** une carte
« Démarrez en 3 étapes » avec la progression (x/3), chaque étape cochée ou cliquable. La carte
**disparaît d'elle-même** quand les 3 sont faites — et **réapparaît** si l'état régresse (carte vidée,
canal coupé) : c'est le bénéfice de l'auto-déduction, aucun état à maintenir.

## 4. Scrub scroll = premium

`apps/web/src/lib/lp/data.ts` : le select ne ramène pas le plan aujourd'hui
(`'id, slug, name, lp_config, drive_enabled, whapi_channels(phone)'`) → l'étendre pour connaître le plan
du resto (jointure `subscriptions(plan, status)`).
`apps/web/src/components/lp/Hero.tsx:18` : la condition `frames?.status === 'ready' && frames.count > 0`
gagne **`&& isPremium`**. Sinon → rendu actuel (hero image/statique), déjà en place = fallback naturel.
Aucun changement de schéma, aucune suppression du worker `lpframes` (il reste utile pour les premium).

## Tests

- `apps/web/test/onboarding.test.ts` : `onboardingSteps`/`onboardingDone`/`onboardingProgress` (aucune
  étape faite → 0/3 et 3 étapes non cochées ; canal+carte → 2/3 ; les 3 → done ; régression = non done).
- Rate-limit : `recoveryRateKeys` (helper pur) testé comme `orderRateKeys`/`wheelUnlockRateKeys`.
- Les routes/pages ne sont pas testées unitairement (pattern web existant) → build + typecheck verts.

## Sécurité

- **Aucune énumération de comptes** : `/api/auth/recovery` répond toujours pareil.
- **Rate-limit** par IP sur la récupération.
- Le lien de récupération **est** une clé d'accès : l'envoyer sur WhatsApp équivaut à l'envoyer par email
  (même modèle de menace). Il n'arrive que sur le `contact_phone` du resto.
- L'admin **ne connaît plus** le mot de passe du gérant (c'est l'objet du chantier).
- `generateLink` et l'API auth admin exigent le **service_role** → jamais côté client.

## Hors périmètre

- Inscription publique en libre-service (changement de modèle — non retenu).
- Bouton admin « réinitialiser le mot de passe » (le « Renvoyer une invitation » couvre le besoin).
- Vérification réelle de l'email (on garde `email_confirm: true`).
