# Spec — Roue QR + action sociale (Fidélité v3)

Date : 2026-07-13. Branche : `feature/roue-qr-sociale`. Migration `20260713000028`.

## Intention

Refondre le déclenchement de la roue de la fortune : au lieu de « après N commandes », la roue
devient un **flux public activé par QR code** après une **action sociale** (avis Google / abonnement
TikTok / abonnement chaîne WhatsApp). Reprise de l'UX de **cartelle** (repo public
`FranckSowax/cartelle`) — roue SVG jouable, éditeur/preview de segments, page de redirection sociale
avec compte à rebours, génération QR — **sur le socle sécurisé Goutatou** (tirage 100 % serveur
`spin_wheel` + jeton HMAC single-use), qui remplace les failles de cartelle.

Décisions produit (Franck, validées) :
- **Déblocage** : redirection + honor-system (page ouvre l'action, compte à rebours ~25 s, bouton
  « J'ai terminé »). Aucune vérification programmatique de l'action (impossible sur Google/TikTok).
- **Portée** : **remplace** le déclenchement par commandes. Le rappel d'expiration des gains reste.
- **Anti-abus** : **1 tour / numéro / période** (défaut 30 j).
- **Actions** : sous-ensemble activable par l'admin ; **1 action suffit** pour tourner.
- **Numéro** : **opt-in marketing implicite** (case pré-cochée + STOP existant).

## Sécurité (non négociable — l'anti-pattern cartelle à NE PAS reproduire)

Cartelle tire côté client (`Math.random()` navigateur) et insère les `spins` via une **RLS publique
`INSERT WITH CHECK (true)`** — n'importe qui force son lot. Le cooldown y repose sur un `user_token`
localStorage effaçable. **On ne reprend rien de ce back-end.** Goutatou garde :
- **Tirage serveur atomique** `spin_wheel` (SQL SECURITY DEFINER, service_role) — inchangé.
- **Jeton HMAC single-use** (`packages/db/src/wheel-token.ts` `signWheelToken`/`verifyWheelToken`).
- **Aucune écriture publique** : la page publique ne fait AUCUN `insert` Supabase ; tout passe par des
  routes serveur (`/api/roue/*`) qui utilisent le service client et vérifient l'éligibilité.
- **Cooldown par NUMÉRO côté serveur** (pas de clé localStorage) : vérifié à l'émission du jeton ET
  ré-vérifié atomiquement au tirage.

## Ce qu'on reprend de cartelle (VISUEL/UX uniquement, restyle Goutatou)

- **Roue SVG jouable** (`app/spin/[shopId]/page.tsx`) : segments en arcs (viewBox 0 0 400 400), labels
  multi-lignes, images de lots, **calcul de l'angle cible** vers le segment gagnant
  (`extraSpins*360 + distToTarget`, transition `cubic-bezier(0.1,0.6,0.15,1)` ~5,2 s), anneau LED +
  pointeur, **hook confetti** au gain.
- **Éditeur/preview** (`components/dashboard/WheelPreview.tsx` + `distributeSegments()` anti-adjacence).
- **Page de redirection** : `window.open(lien,'_blank')` + **compte à rebours 25 s** avant d'activer
  « J'ai terminé ».
- **QR** : côté Goutatou on **réutilise `apps/web/src/lib/qr.ts` `qrSvg`** (déjà utilisé pour
  l'invitation chaîne) — pas de nouvelle dépendance `qrcode`.
- **Champ téléphone** avec validation (réutiliser les helpers wa/téléphone existants
  `apps/web/src/lib/lp/wa.ts` + validation E.164 par indicatif déjà présente côté campagnes).

## Modèle de données (migration 0028)

```sql
-- Config des actions sociales + mode QR public + période cooldown, par restaurant.
alter table restaurants add column if not exists wheel_qr_public boolean not null default false;
alter table restaurants add column if not exists wheel_google_url text;
alter table restaurants add column if not exists wheel_tiktok_url text;
alter table restaurants add column if not exists wheel_channel_url text;
alter table restaurants add column if not exists wheel_action_google boolean not null default false;
alter table restaurants add column if not exists wheel_action_tiktok boolean not null default false;
alter table restaurants add column if not exists wheel_action_channel boolean not null default false;
alter table restaurants add column if not exists wheel_spin_period_days int not null default 30;

-- Action déclarée par le client (stat) sur chaque tour public.
alter table wheel_spins add column if not exists declared_action text
  check (declared_action in ('google','tiktok','channel'));
-- Source du tour : 'order' (historique) ou 'qr_public' (nouveau flux).
alter table wheel_spins add column if not exists source text not null default 'order'
  check (source in ('order','qr_public'));

notify pgrst, 'reload schema';
```

- `wheel_channel_url` : pré-remplissable côté UI avec `restaurants.wa_channel_invite`.
- Éligibilité 1/numéro/période : requête `wheel_spins` par `customer_id` + `created_at >= now() -
  period` + `source='qr_public'`. Le client est **créé/retrouvé par téléphone** (chat dérivé
  `<digits>@s.whatsapp.net`) avec `marketing_opt_in=true` (opt-in implicite), `opted_out=false`.
- Le trigger commandes (`wheel_trigger_orders` / notifier `shouldOfferSpin`) est **désactivé** quand
  `wheel_qr_public=true` (mutuellement exclusif ; sinon comportement v2 inchangé — pas de régression
  pour un resto qui n'active pas le QR public).

## Flux public

1. **QR** (imprimé) → `https://<domaine>/roue/[restaurantId]` (page publique, pas de jeton en URL).
2. Page publique (`app/roue/[restaurantId]/page.tsx`, client) :
   - Charge (via route serveur read-only) la config roue (segments/lots, couleurs, actions activées +
     liens). Affiche la roue SVG (non tournante) + les **actions activées** en boutons.
   - Client clique une action → `window.open(lien)` + **countdown 25 s** → bouton « J'ai terminé ».
   - Saisie **numéro WhatsApp** (case opt-in pré-cochée) → POST `/api/roue/unlock`
     `{ restaurantId, phone, action }`.
3. **`/api/roue/unlock`** (serveur) : valide le numéro ; upsert client par téléphone (opt-in) ;
   vérifie éligibilité (aucun `qr_public` spin < période) ; si OK **mint jeton HMAC** (customer_id +
   restaurant + jti + declared_action) TTL court (ex. 10 min) ; renvoie `{ token }`. Sinon renvoie
   `{ error: 'déjà joué', nextEligibleAt }` (message FR : « Vous avez déjà tourné, revenez le … »).
4. Le client appelle **`/api/roue/spin`** (existant, étendu) avec le jeton → **re-vérifie
   l'éligibilité atomiquement** (garde anti double-tour même sur 2 requêtes concurrentes) → `spin_wheel`
   → insère `wheel_spins` (`source='qr_public'`, `declared_action`) → renvoie le segment gagnant.
5. La page **anime** la roue vers le segment gagnant + confetti, affiche le résultat, et le gain est
   **envoyé sur WhatsApp** (réutiliser le chemin notifier/gain existant : le worker `wheel-reminder`
   gère déjà l'expiration ; l'envoi immédiat du code se fait via le notifier ou une route serveur qui
   poste le message gagnant — réutiliser `sendInteractiveUrl`/`sendText` du client whapi).

## Admin (`/app/fidelite`)

- **Conserver** l'éditeur segments/lots existant (prix, poids, images, poids unlucky/retry).
- **Ajouter** un composant **preview roue** (porté de `WheelPreview.tsx`, restylé).
- **Ajouter** une section « Roue par QR » :
  - toggle `wheel_qr_public` (active le flux public ; désactive le trigger commandes) ;
  - 3 blocs action (Google / TikTok / Chaîne) : interrupteur `wheel_action_*` + champ lien
    `wheel_*_url` (la chaîne pré-remplie avec `wa_channel_invite`) ;
  - champ **période** `wheel_spin_period_days` ;
  - **QR imprimable** de `/roue/[restaurantId]` (via `qrSvg`) + bouton imprimer/télécharger.
- Gating premium/pro inchangé (vérifier le helper réel `@/lib/premium`).

## Composants & isolement

- `packages/db` : réutiliser `wheel-token.ts` (ajouter `declared_action`/`source` aux claims si utile).
- `apps/web/src/app/roue/[restaurantId]/` : page publique + `wheel-svg.tsx` (roue jouable portée) +
  `social-actions.tsx` (redirection + countdown) + `unlock-form.tsx` (téléphone + opt-in).
- `apps/web/src/app/api/roue/unlock/route.ts` (nouveau) ; `api/roue/spin/route.ts` (étendu).
- `apps/web/src/app/app/fidelite/` : `wheel-preview.tsx` (porté) + section QR dans la page + actions
  `updateWheelQrSettings`.
- Helpers purs testés : calcul angle cible, `distributeSegments`, éligibilité (période → bool + date),
  validation numéro.

## Tests

- Helpers purs : angle cible (segment i → rotation attendue), distributeSegments (anti-adjacence),
  éligibilité (spin récent < période → refus + date ; > période → OK ; source order ignoré).
- Route unlock : numéro invalide → 400 FR ; déjà joué < période → refus ; OK → jeton signé.
- Route spin : ré-vérif éligibilité (2e appel même numéro → refus) ; jeton invalide/expiré → refus.
- Non-régression : resto sans `wheel_qr_public` → flux v2 (trigger commandes) inchangé.

## Hors périmètre (v1)

- Rotation de la plateforme par jour (`weekly_schedule` cartelle) — backlog.
- Bonus d'engagement multi-plateforme (+points) — backlog.
- Vérification réelle de l'action sociale (impossible) — resté honor-system.
- Commande de supports imprimés physiques (spécifique cartelle).

## Déploiement

Migration 0028 via MCP + `notify pgrst` ; merge main ; Netlify (web) ; Railway si le bot touche à
l'envoi du gain. Smoke Franck : activer Roue QR sur Chez Démo, configurer 1-3 actions + période,
imprimer le QR, scanner, faire une action, tourner avec un numéro, recevoir le gain sur WhatsApp,
re-scanner avec le même numéro → refus « déjà joué ».
