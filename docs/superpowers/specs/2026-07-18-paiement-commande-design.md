# Paiement à la commande (Gabon) — spec

**But :** adapter le flux « panier → mode → upsell → payer » au marché gabonais : **Airtel Money (manuel, vérifié par le resto)** ou **paiement à la récupération/livraison (cash)**, configurable par restaurant. Pas de Stripe. Architecture prête pour une future API marchande Airtel (callback → `payment_status='paye'`), sans refonte.

## Décisions
- Airtel = **manuel d'abord** : le bot donne le numéro Airtel du resto + le montant ; le client répond avec la référence (ou « payé ») ; la commande arrive `a_verifier` ; le resto clique « Paiement reçu ✓ » au dashboard → alors seulement l'alerte cuisine part + message client « paiement confirmé ».
- Cash = flux actuel inchangé (commande créée directement, alerte cuisine immédiate).
- Upsell = suppléments existants (aucun nouveau réglage).
- Étape Paiement **sautée** si le resto n'a pas activé Airtel (ou pas de numéro) — comportement actuel conservé pour tous les restos par défaut (`payment_airtel_enabled=false`).
- Si cash désactivé ET Airtel activé → Airtel imposé (pas de bouton cash).
- Détail des plats du panier natif : DISPONIBLE (getOrderItems + mapping retailer_id) — pas de placeholder, le caveat du flux d'origine ne s'applique pas.

## Fondations (FAITES — migration 20260718000038 appliquée prod)
- `restaurants` : `payment_cash_enabled bool default true`, `payment_airtel_enabled bool default false`, `payment_airtel_number text`, `payment_airtel_name text`.
- `orders` : `payment_method ('cash'|'airtel')`, `payment_status ('na'|'a_verifier'|'paye') default 'na'`, `payment_ref text`, `paid_at`, `paid_confirmed_by`.
- `create_order` v3 : + `p_payment_method`, `p_payment_ref` (ancienne signature 7 params DROPpée — évite la surcharge ambiguë PostgREST). Statut dérivé serveur : airtel→`a_verifier`, sinon `na`. service_role only.

## Lot Bot (`services/whatsapp/` + `packages/db/src/types.ts`)
- `BotState` + `'PAIEMENT'` + `'PAIEMENT_REF'` (types.ts:3). `Cart` + `payment?: 'cash'|'airtel'` + `paymentRef?: string` (cart jsonb, pas de migration conversations).
- `BotContext`/`BotProfile` + `payment: { cashEnabled, airtelEnabled, airtelNumber, airtelName }` — chargé dans `getBotContext` (repo.ts:111-114, select étendu).
- Machine (`machine.ts` case `CONFIRMATION` ~336) : sur « oui », si `airtelEnabled && airtelNumber` → état `PAIEMENT` (question « Comment réglez-vous vos X F ? ») ; sinon `createOrder:true` direct (flux actuel).
  - `PAIEMENT` : entrée `cash` (si cashEnabled) → `cart.payment='cash'` → `createOrder:true`. Entrée `airtel` → copy instructions (montant `cartTotal`, numéro, nom) → état `PAIEMENT_REF`. Si cash désactivé, seul le bouton Airtel est proposé.
  - `PAIEMENT_REF` : tout texte non vide (≥3 chars, ou « payé ») → `cart.payment='airtel'`, `cart.paymentRef=texte` → `createOrder:true`. `annuler` global marche toujours.
- Boutons (`buttons.ts::buttonsForState`) : case `PAIEMENT` → [📱 Airtel Money] (id `in:airtel`) + [💵 À la récupération / À la livraison selon mode] (id `in:cash`) ; titres ≤20 chars discriminants (round-trip par titre déjà géré par matchButtonInput).
- Processor (repo.createOrder repo.ts:223-241) : passe `p_payment_method: cart.payment ?? null`, `p_payment_ref: cart.paymentRef ?? null`.
- Copy (`copy.ts` + `orderConfirmedCopy` processor.ts:146) : cash → texte actuel (« Total à régler à la remise ») ; airtel → « Commande enregistrée ! Le restaurant vérifie votre paiement Airtel Money et lance la préparation. »
- Notifier (`notifier.ts`) :
  - `buildStaffTicket` : ligne « Paiement : 📱 Airtel (à vérifier) / 📱 Airtel ✓ / 💵 À la remise ».
  - `handleOrderInsert` : si `payment_status='a_verifier'` → NE PAS envoyer le ticket cuisine tout de suite (le garder pour la validation).
  - `handleOrderUpdate` : nouveau déclencheur `payment_status` passe à `'paye'` → envoyer le ticket groupe cuisine + message client « ✅ Paiement confirmé — commande n° X en préparation. ».
- TDD machine (états PAIEMENT/PAIEMENT_REF, gating par ctx.payment, montants), tests notifier si harnais existant.

## Lot Web (`apps/web/`)
- **Réglages** (`app/app/reglages/`) : onglet `paiement` dans `REGLAGES_TABS` (page.tsx:14) + `payment-form.tsx` (client) : switch cash, switch Airtel, numéro Airtel, nom titulaire ; action `updatePaymentSettings` dans actions.ts (myRestaurantId + écriture via createAdminClient — pas de RLS UPDATE tenant sur restaurants), garde `assertOwner` héritée du helper.
- **Kanban commandes** (`app/app/commandes/board.tsx` + carte) : badge paiement sur la carte — `payment_method='airtel' && payment_status='a_verifier'` → badge ambre « 📱 Airtel — à vérifier » + bouton **« Paiement reçu ✓ »** ; `'paye'` → badge vert « 📱 Airtel ✓ » ; `'cash'` → badge discret « 💵 À la remise » ; select du board étendu aux colonnes payment.
- Action `confirmPayment(orderId)` (server action commandes) : membre du resto (pas owner-only — un caissier encaisse), update `payment_status='paye', paid_at=now(), paid_confirmed_by=uid` via client RLS (policy tenant_all_orders for all existe) `.eq('payment_status','a_verifier')` (idempotent). Realtime UPDATE propage au notifier (bot) qui envoie ticket cuisine + message client.
- **Alerte cuisine web** (`lib/live-alert.ts` / overlay) : une commande INSERT avec `payment_status='a_verifier'` ne déclenche PAS l'overlay/carillon ; le déclenche à l'UPDATE vers `paye`. Cash/na : comportement actuel.
- **Ticket imprimable** (`commandes/[id]/ticket/page.tsx`) : ligne Paiement (méthode + statut + ref).
- Tests purs éventuels (lib badge/label), typecheck + vitest + next build.

## Vérif
`pnpm -r typecheck`, tests bot (vitest) + web, `next build`. Revue : aucun changement de comportement pour un resto sans Airtel activé ; alerte cuisine non dupliquée (INSERT a_verifier silencieux, UPDATE paye sonne UNE fois) ; create_order v3 rétro-compatible (params par défaut) — vérifier que l'API web `/api/lp/[slug]/order` (source web) passe toujours (elle n'envoie pas les nouveaux params). Déploiement : web (merge main→Netlify) + bot (`railway up --detach --service whatsapp-bot`) après « feu deploy ».
