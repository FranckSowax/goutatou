# Marketing (statuts, chaîne, campagnes, QR opt-in) + connexion à distance — Design

Date : 2026-07-12
Statut : validé (Franck : « enchaine marketing » sur les propositions présentées)

## Intention

La sidebar /app remplace « Campagnes » (et l'entrée « Statuts ») par **« Marketing »**
avec 4 sous-onglets : **Statuts WhatsApp** (page actuelle déplacée), **Chaîne WhatsApp**
(nouveau — WhatsApp Channel du resto), **Campagnes** (page actuelle déplacée),
**QR opt-in** (nouveau — générateur de QR de fidélisation). En bonus admin : la
connexion du numéro WhatsApp **à distance** (code d'appairage, QR embarqué) dans
l'onglet Bot de la fiche restaurant.

## Navigation

- `/app/marketing` = layout à sous-nav (Tabs de navigation par segments URL) :
  `/app/marketing/statuts`, `/app/marketing/chaine`, `/app/marketing/campagnes`,
  `/app/marketing/qr`. Défaut : redirect → statuts.
- Pages statuts et campagnes DÉPLACÉES telles quelles (imports ajustés, zéro
  changement fonctionnel). Anciennes routes `/app/statuts` et `/app/campagnes`
  conservées comme `redirect()` (bookmarks).
- Sidebar : une entrée « Marketing » (Megaphone) remplace Campagnes + Statuts.
  Gating Pro/premium inchangé PAR PAGE (statuts/campagnes gardent leur gating,
  chaîne = Pro comme statuts, QR = tous plans).

## QR opt-in (fidélisation)

- Principe : QR encodant `https://wa.me/{numéro du canal}?text={MOTCLÉ}`.
  Le client scanne → WhatsApp pré-rempli → envoie → le bot agit + le client
  devient un contact (upsert existant) + traçable par mot-clé.
- Mots-clés v1 (fixes, pas de CRUD) : **MENU** (existant), **INFOS** (existant),
  **ROUE** (nouveau : pitch fidélité + progression « X commandes sur N » si
  wheel_enabled, sinon présentation du programme — PAS de tour gratuit v1),
  **PROMOS** (nouveau : opt-in marketing explicite).
- PROMOS : migration 0019 `customers.marketing_opt_in boolean not null default false`
  → true + réponse FR « C'est noté !… envoyez STOP pour vous désinscrire ».
  N'altère PAS l'audience campagnes v1 (opt-out reste le critère) — le compteur
  d'opt-in est affiché, le ciblage opt-in = décision ultérieure.
- Page /app/marketing/qr : le numéro vient du canal Whapi (whapi_channels.phone ;
  si absent → état vide FR « Connectez d'abord votre canal WhatsApp »). Une carte
  par mot-clé : QR SVG généré serveur (dep `qrcode`, rendu SVG string), lien wa.me
  copiable, bouton télécharger (SVG), compteur 30 j (count message_logs direction
  'in' body ilike motclé). Style imprimable (fond blanc forcé sur le QR).

## Chaîne WhatsApp (Channel/newsletter)

- Migration 0019 : `restaurants.wa_channel_id text`, `wa_channel_invite text`.
- packages/whapi : `createNewsletter(name)`, `getNewsletterInvite(id)`,
  `sendNewsletterText(id, body)`, `sendNewsletterImage(id, url, caption)` —
  endpoints exacts À VÉRIFIER dans la doc du skill whapi (/newsletters).
- /app/marketing/chaine : pas de chaîne → bouton « Créer la chaîne {nom} »
  (server action : décrypte le token canal — TOKEN_ENCRYPTION_KEY est déjà sur
  Netlify — crée la chaîne, stocke id+invite) ; chaîne existante → lien
  d'invitation (copiable + QR SVG réutilisant le même générateur), composer
  texte/image (envoi immédiat, pas de programmation v1), erreurs Whapi →
  messages FR fixes (« La chaîne n'est pas disponible sur ce canal. »).
- AUCUN worker : actions directes (posts immédiats).

## Connexion du numéro à distance (fiche admin, onglet Bot)

- packages/whapi : `getLoginQr()` (GET /users/login — image base64) et
  `getLoginCode(phone)` (GET /users/login/{PhoneNumber} — code d'appairage) —
  endpoints exacts à vérifier dans la doc du skill.
- Onglet Bot : section « Connexion du numéro » (si canal configuré) : input
  numéro → bouton « Obtenir un code d'appairage » (affiche le code 8 car. +
  mode d'emploi FR : WhatsApp → Appareils connectés → Connecter avec le numéro)
  + bouton « Afficher le QR » (image base64, note : expire vite, rafraîchir).
  Actions admin (garde is_platform_admin, token décrypté serveur, JAMAIS renvoyé).

## Hors scope (backlog)

Programmation des posts de chaîne, CRUD mots-clés custom, tour de roue gratuit
via QR, ciblage campagnes par opt-in, stats de chaîne (abonnés/vues).

## Vérification

Tests bot (PROMOS/ROUE), tests whapi (4+2 méthodes), tests web (compteurs QR,
génération wa.me), gates complets, revue opus (décryptage token dans les actions
web = surface sensible), migration prod + notify pgrst, deploys, smoke Chez Demo
(QR page rend les 4 cartes ; chaîne = smoke impossible sans canal réel — tests).
