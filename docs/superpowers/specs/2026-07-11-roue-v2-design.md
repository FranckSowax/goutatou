# Roue v2 + notifications interactives — Design

Date : 2026-07-11
Statut : validé (Franck : « feu roue v2 » sur le backlog issu de l'étude cartelle)

## Intention

Reprendre le meilleur produit de cartelle SANS ses failles : segments « Pas de chance »
et « Rejouez » paramétrables, images de lots, expiration des gains + rappel WhatsApp,
boutons interactifs Whapi, pré-validation des numéros de campagne. Le tirage reste
100 % serveur (spin_wheel atomique, jeton HMAC single-use) — non négociable.

Écarté (v3, données manquantes) : cron anniversaires (pas de date de naissance client),
cron inactifs (marketing — à cadrer avec opt-out/quota).

## Migration 0017

- `prizes.image_url text` (nullable).
- `restaurants.wheel_unlucky_weight int not null default 0 check (>= 0)`,
  `restaurants.wheel_retry_weight int not null default 0 check (>= 0)` —
  0/0 = comportement v1 inchangé (toujours gagnant).
- `wheel_spins.outcome text not null default 'prize' check (outcome in ('prize','lose','retry'))`,
  `prize_id` devient nullable (lose/retry n'ont pas de lot), `expires_at timestamptz`
  (posé par spin_wheel v2 : created_at + 30 jours, pour les gains uniquement).
- Bucket storage `prize-media` scopé tenant (mêmes policies durcies que menu-photos).

## spin_wheel v2 (fonction re-déclarée, pgTAP, ACL service_role préservée)

- Tirage pondéré unique sur : lots actifs en stock (weights existants) +
  segment lose (wheel_unlucky_weight) + segment retry (wheel_retry_weight).
- outcome prize : décrément stock + code 6 car. + expires_at (+30 j) — identique v1 sinon.
- outcome lose/retry : ligne wheel_spins sans prize_id ni code (jti consommé, audit).
- RÉTROCOMPAT : weights 0/0 → résultats byte-identiques à v1 (pgTAP le prouve).
- Verrou advisory jti + anti-survente conservés à l'identique.

## Web

- `/api/roue/spin` : réponse gagne {outcome:'prize', label, code, expiresAt} ;
  {outcome:'lose'} ; {outcome:'retry', retryToken} — retryToken = jeton HMAC neuf
  (jti = `${jti}:r1`, TTL 1 h, UN seul rejeu par jeton d'origine : un jti `…:r1`
  ne peut pas produire de retry en chaîne).
- `/roue` : segments Perdu (gris)/Rejouez (ambre) affichés quand configurés, images de
  lots sur les segments (fallback label), résultat lose (message sympa FR) / retry
  (bouton « Rejouer » qui réutilise retryToken), gain affiche l'expiration.
- `/app/fidelite` : réglages « Segment Pas de chance / Rejouez » (poids, 0 = off),
  upload image par lot (action serveur, bucket prize-media, ≤4 Mo), la validation
  d'un code REFUSE un gain expiré (message FR clair).

## Bot / Whapi

- packages/whapi : `sendInteractiveUrl(to, body, buttonText, url)` (POST /messages/interactive,
  type button URL) + tests.
- Notifier : le message « roue » utilise le bouton interactif (« 🎰 Tourner la roue »),
  FALLBACK sendText à l'identique si l'interactif échoue (pattern cartelle congratulate).
- Campagnes : pré-validation avant envoi — longueur E.164 par indicatif (241 : 8 ou 9
  chiffres après indicatif ; helper pur testé) + `checkContact` Whapi (GET /contacts) ;
  numéro invalide/sans WhatsApp → recipient failed 'numéro invalide', aucun envoi,
  aucun crédit du throttle consommé.
- Worker `wheel-reminder` (poll 6 h, pattern workers existants, single replica) :
  gains non utilisés expirant dans ≤3 jours ET pas encore rappelés
  (`reminded_at timestamptz` sur wheel_spins, même migration) → message WhatsApp
  « Votre lot {label} expire le {date} » (best-effort, opt-out respecté).

## Vérification

pgTAP spin_wheel v2 (rétrocompat 0/0 prouvée, pondération lose/retry, stock, ACL),
tests web (retry token, réglages), tests bot (interactive fallback, pré-validation,
reminder), revue finale opus (fonction re-durcie + jetons), migrations prod, deploys
Netlify+Railway, smoke SQL Chez Demo.
