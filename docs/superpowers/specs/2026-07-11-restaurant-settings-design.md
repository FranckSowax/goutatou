# Paramétrage restaurants & bot (étape 1) — Design

Date : 2026-07-11
Statut : validé (Franck : hybride progressif, édition admin + restaurateur)

## Intention

Chaque restaurant devient paramétrable : fiche pratique (adresse, horaires,
livraison, téléphone) + messages du bot (accueil personnalisé, infos
complémentaires). Le bot répond à « infos » depuis la fiche (machine
déterministe). /admin est restructuré (Dashboard / Restaurants / fiche à
onglets), le restaurateur édite sa fiche dans /app/reglages.

Étape 2 (chantier séparé) : IA Claude en repli sur les messages non compris,
prompt par resto nourri par cette même fiche + le menu. Hors scope ici.
Hors scope aussi : brancher la fiche dans la LP publique (backlog).

## Migration 0018

```sql
alter table restaurants
  add column address text,
  add column contact_phone text,
  add column hours_text text,
  add column delivery_info text,
  add column bot_welcome text,
  add column bot_info_extra text;
```
Tous nullables — null = comportement actuel (aucun défaut imposé).

## Bot

- Le processor charge la fiche (repo) et l'injecte au contexte machine
  (`ctx.profile { address, hoursText, deliveryInfo, contactPhone, infoExtra }`
  champs null omis) — machine PURE inchangée dans son style.
- Accueil : si `bot_welcome` non vide → ce texte (+ rappel des commandes menu/infos),
  sinon copy actuel. Le welcome mentionne désormais « infos ».
- Nouvelle commande globale `infos` (insensible casse, comme `menu`) : bloc FR
  listant adresse/horaires/livraison/téléphone/infos extra (seulement les champs
  remplis) ; fiche entièrement vide → « Contactez-nous au … » fallback sur le
  numéro du canal ou message générique. Depuis n'importe quel état non-HUMAIN,
  sans perdre le panier (comme `panier`).
- TDD : welcome défaut inchangé (non-régression), welcome perso, infos complet,
  infos partiel, infos vide, infos pendant une commande (état conservé).

## /admin restructuré

- Nav admin : `Dashboard` (/admin — KPIs actuels seuls) et `Restaurants`
  (/admin/restaurants — table actuelle + onboarding, lignes cliquables).
- Fiche `/admin/restaurants/[id]` à onglets (composant Tabs shadcn) :
  - **Général** : nom, fiche pratique (adresse/tél/horaires/livraison),
    drive on/off, plan + statut abonnement (lecture + changement de plan —
    action existante ou nouvelle, pattern admin).
  - **Bot WhatsApp** : statut canal (configuré/QR/non configuré), re-saisie du
    token (action onboarding existante réutilisée), bot_welcome + bot_info_extra
    avec APERÇU du rendu (le bloc infos tel que le client le verra).
  - **Site (LP)** : statut publication, URL /r/slug, bouton vers l'éditeur
    /admin/lp/[id] existant (INTOUCHÉ).
  - **Fidélité** : wheel_enabled + trigger (lecture/édition rapide) + lien
    « gérer les lots » (dashboard resto).
  - **Danger** : suppression du restaurant (dialog destructive, cascade).
- Client admin (service role) après garde is_platform_admin — pattern admin/actions.ts.

## /app/reglages (restaurateur)

- Nouvelle entrée sidebar « Réglages » (icône Settings, en bas).
- Page à sections : Fiche pratique (adresse/tél/horaires/livraison) +
  Messages du bot (accueil, infos extra, même aperçu). PAS de canal/plan/danger.
- Écritures restaurants via client admin après garde membre (pattern 3A —
  pas de policy UPDATE membre sur restaurants).

## Vérification

Tests machine bot (6 cas ci-dessus) ; gates web/bot/db complets ; revue finale
opus ; migration prod + notify pgrst ; deploys Netlify + Railway ; smoke : fiche
Chez Demo remplie en SQL → visible sur /admin et /app, bot local « infos » via
tests (canal réel toujours en attente de scan QR).
