# Carte de fidélité digitale à tampons — spec

**But :** remplacer la roue par une **carte de fidélité** liée au numéro WhatsApp : compteur cumulatif de commandes, paliers (seuil → lot) fixés par le gérant, crédit +1 en caisse via **QR fixe** (anti-abus par cooldown), page carte publique perso (cover/logo resto, progression, lots), infos client (nom, date de naissance).

## Décisions
- QR **fixe** du resto + **cooldown** anti-abus (défaut 4 h, configurable). Garde atomique SQL (verrou par client + re-check + incrément), reprise du pattern `spin_wheel`.
- Roue **remplacée** (retirée de la page Fidélité ; code roue conservé, non supprimé).
- Paliers **cumulatifs** (le compteur ne se remet pas à zéro ; les lots sont des jalons uniques).
- Bot envoie le lien carte à la **1ʳᵉ commande récupérée** + sur mot-clé « fidélité/carte ». Offre de tour de roue désactivée.
- Branding carte **dédié** : `restaurants.loyalty_logo_url` / `loyalty_cover_url` (upload sur la page Fidélité).

## Fondations (FAITES)
- Migration `20260718000037_loyalty_card.sql` (appliquée prod) :
  - `customers`: `loyalty_stamps int default 0`, `birthdate date`, `last_stamp_at timestamptz`.
  - `restaurants`: `loyalty_enabled bool`, `loyalty_stamp_code text` (défaut aléatoire, pour le QR), `loyalty_cooldown_hours int default 4`, `loyalty_logo_url text`, `loyalty_cover_url text`.
  - Tables `loyalty_rewards (restaurant_id, threshold unique/resto, label, active, position)`, `loyalty_redemptions (restaurant_id, customer_id, reward_id, threshold, redeemed_at, redeemed_by; unique(resto,customer,threshold))`, `loyalty_stamps_log`.
  - RLS `tenant_all_*` (is_member). Fonction `add_loyalty_stamp(p_restaurant_id, p_customer_id) returns (stamps int, reached_threshold int, reached_label text)` (cooldown atomique, service_role only).
- Token : `packages/db/src/loyalty-token.ts` (`signLoyaltyToken({rid,cid,ttlSec?}, secret, nowSec)` TTL défaut 10 ans, `verifyLoyaltyToken`), export `@goutatou/db/loyalty`. Secret = `WHEEL_JWT_SECRET` (réutilisé). Testé.

## Lot 1 — Page admin `/app/fidelite` (refonte, gating Pro)
Réutiliser `isPro`/`assertPlan` + contournement RLS `createAdminClient()` pour updates `restaurants` (cf. actions.ts existant). 3 onglets (composant `PageTabs` existant) :
- **Carte** : toggle `loyalty_enabled`, upload **logo** + **cover** (pattern `updatePrizeImage` : bucket `prize-media`, chemins `${rid}/loyalty/logo.${ext}` et `/cover.${ext}`, `getPublicUrl` → colonnes), champ `loyalty_cooldown_hours`, affichage + téléchargement du **QR de caisse** (`lib/qr.ts::qrSvg` sur l'URL `${SITE}/f/s/<loyalty_stamp_code>`), bouton **régénérer le code** (nouveau `loyalty_stamp_code`, invalide l'ancien QR).
- **Paliers** : CRUD `loyalty_rewards` (seuil + lot, actif, réordonner) — modèle des `prizes` actuels (`prizes.tsx`/actions CRUD), sans poids/stock/image.
- **Valider un lot** : saisie numéro client → liste des paliers atteints (`customers.loyalty_stamps >= threshold`) non récupérés (`loyalty_redemptions`) → bouton « Marquer remis » (insert redemption, `redeemed_by = auth uid`). Modèle `redeem-form`/`redeemCode`.
- Retirer les onglets roue/QR de la page (ne pas supprimer les fichiers roue).
- Actions (`actions.ts`) : chaque action `myRestaurantId` + `assertPlan(['pro','premium'])`. `updateLoyaltySettings`, `uploadLoyaltyImage(kind)`, `regenerateStampCode`, `createReward/updateReward/toggleReward/deleteReward/reorderRewards`, `redeemTier(phone, threshold)`.

## Lot 2 — Carte publique + scan caisse (`apps/web/src/app/f/`)
- `f/[token]/page.tsx` (public, `force-dynamic`) : `verifyLoyaltyToken` (secret `WHEEL_JWT_SECRET`) → rid/cid. `createAdminClient()` charge resto (name, `loyalty_logo_url`, `loyalty_cover_url`, `lp_config.theme` pour les couleurs), customer (name, birthdate, loyalty_stamps), `loyalty_rewards` actifs (triés threshold asc), `loyalty_redemptions` du client. Rend `<LoyaltyCard>` (client) : cover en bandeau, logo, nom resto, gros compteur « X commandes », barre de progression vers le **prochain palier**, liste des lots (statut : à venir / atteint / récupéré), formulaire nom + date de naissance. Stocke le token en `localStorage` (`goutatou_card_<rid>`) pour le scan.
- `f/s/[code]/page.tsx` (public) : résout le resto par `loyalty_stamp_code` (admin client) ; si introuvable → message d'erreur. Client component `<StampClaim>` : lit `localStorage goutatou_card_<rid>` ; si présent → POST auto `/api/f/stamp {token}` → affiche le résultat (+1, palier éventuel) et lien vers la carte ; sinon demande le **numéro WhatsApp** → POST `/api/f/stamp {code, phone}`.
- API `app/api/f/stamp/route.ts` (POST public, `enforceRateLimit` par IP+resto comme `api/roue/unlock`) : 
  - avec `{token}` : `verifyLoyaltyToken` → rid/cid.
  - avec `{code, phone}` : résout resto par code, `normalizeGabonPhone`, **upsert customers** (par phone, scoped resto ; opt-in marketing à la création ; chat_id `${digits}@s.whatsapp.net`), cid = customer.id. Émet aussi un token à renvoyer.
  - Vérifie `restaurants.loyalty_enabled`. Appelle `db.rpc('add_loyalty_stamp', {p_restaurant_id, p_customer_id})` (service_role). Mappe erreurs `cooldown` (→ 429 « déjà validé récemment, revenez plus tard ») / `customer_not_found`. Retourne `{ stamps, reachedThreshold, reachedLabel, token }`.
- API `app/api/f/profile/route.ts` (POST) : `{token, name, birthdate}` → `verifyLoyaltyToken` → update customers (name, birthdate) via admin client scoped rid/cid.
- Helper pur `lib/loyalty.ts` : `nextTier(stamps, rewards)` (prochain seuil + reste), `tierStatus(threshold, stamps, redeemedThresholds)` (`à venir`|`atteint`|`recupere`). Testé.

## Lot 3 — Bot (`services/whatsapp/src/`)
- Remplacer l'offre de roue post-commande (`notifier.ts:132-164`) : si `restaurants.loyalty_enabled`, à la **1ʳᵉ commande `recuperee`** du client (count == 1), envoyer le lien carte : `signLoyaltyToken({rid,cid}, WHEEL_JWT_SECRET)` → `${WHEEL_BASE_URL}/f/${token}` → `sendInteractiveUrl(chat_id, body, '💳 Ma carte de fidélité', link)` (fallback `sendText`). Idempotence : jti déterministe indisponible ici → garde par `count==1` (1ʳᵉ récupération) suffit.
- Mot-clé bot « fidélité »/« carte » (`bot/machine.ts` + `copy.ts`) → renvoyer le lien carte (via processor qui a accès au customer_id + secret). Conserver le mot-clé « roue » mais le rediriger vers la carte (ou message neutre) si `loyalty_enabled`.
- Ne PAS envoyer d'offre de roue quand `loyalty_enabled` (la roue reste inerte : `wheel_enabled` restera false).
- Helpers `loyalty/card-trigger.ts` : `buildCardLink(baseUrl, token)`, `cardMessageBody()`. Tests purs si logique.

## Vérif
Chaque lot : pas de casse des flux existants. Global : `pnpm -r typecheck`, tests web + db + bot, `next build` (routes `/f/[token]`, `/f/s/[code]`, `/app/fidelite`). Revue opus non-régression (surtout : cooldown atomique, upsert customer au scan, aucun accès croisé resto, roue proprement retirée sans casser le build). Déjà appliqué : migration prod + token.
