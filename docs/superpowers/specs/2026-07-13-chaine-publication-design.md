# Chaîne WhatsApp — rattachement + publication manuelle (Pro) — Design

Date : 2026-07-13
Statut : validé (Franck : chantier 1 seul ; rattachement dans la fiche admin onglet Bot)

## Intention

Le restaurant a souvent DÉJÀ une chaîne WhatsApp : on la **détecte et rattache**
(fiche admin, onglet Bot) au lieu d'en créer une nouvelle, puis on enrichit
`/app/marketing/chaine` d'un **composer manuel Pro** (texte, photo, vidéo, album
catalogue, sondage) + historique/abonnés. La Chaîne Auto premium = chantier 2.

## Rattachement (fiche admin, onglet Bot — section « Chaîne WhatsApp »)

- Bouton « Détecter ma chaîne » → action admin : décrypte le token DANS l'action
  → whapi.getNewsletters() → filtre les chaînes POSSÉDÉES (role owner/admin —
  vérifier le champ de rôle dans la réponse, parsing défensif). Liste : nom,
  photo, id, nb abonnés (subscribers/followers — champ défensif). Chaque ligne :
  bouton « Rattacher » → écrit restaurants.wa_channel_id + wa_channel_invite
  (invite via getNewsletter si présent) via client admin, écriture
  conditionnelle (garde-fou). Déjà rattachée → badge « Chaîne active : {nom} ».
- Fallback : aucune chaîne détectée → texte FR renvoyant vers /app/marketing/chaine
  (création existante) ou coller un lien d'invitation.
- Réutilise l'onglet Bot existant (le token/numéro Whapi y est déjà) — AUCUNE
  nouvelle saisie de numéro.

## whapi client (extensions)

- getNewsletters() → Array<{ id, name, picture?, role?, subscribers? }>
  (GET /newsletters, parsing défensif — la doc ne montre pas le schéma complet).
- sendChannelVideo(newsletterId, mediaUrl, caption?) → sendMessageVideo
  (POST /messages/video, to = id chaîne @newsletter). (sendNewsletterText/Image
  existent déjà depuis M2.)
- getChannelMessages(newsletterId, count?) → historique
  (GET /newsletters/{id}/messages, défensif) — pour l'historique des posts.

## Web (/app/marketing/chaine — enrichi, Pro-gated comme aujourd'hui)

Chaîne rattachée requise (sinon état actuel « créez/rattachez d'abord »).
- **Composer de post** (une carte à la fois v1, pas de série — c'est le premium) :
  type Texte / Photo / Vidéo / Album catalogue / Sondage.
  - Texte : textarea → sendNewsletterText.
  - Photo : upload image (Server Action existante ou direct — suivre statuts) +
    légende → sendNewsletterImage.
  - Vidéo : upload DIRECT navigateur→storage (bucket status-media réutilisé,
    ≤16 Mo mp4) → sendChannelVideo.
  - Album catalogue : bouton « Publier ma carte » → envoie les N plats
    DISPONIBLES AVEC PHOTO (cap 10, throttle 2 s entre chaque) en photos+légende
    « {nom} — {prix} FCFA » ; best-effort (échec par photo loggé).
  - Sondage : question + 2-12 options → sendPoll(id chaîne, ...) (déjà dispo).
  - Envoi immédiat (pas de programmation — premium). Erreurs Whapi → FR fixes.
- **En-tête** : nom de la chaîne + nb d'abonnés (getNewsletter) + lien invitation
  copiable + QR (lib/qr existant).
- **Historique** : derniers posts via getChannelMessages (texte/aperçu média +
  date), lecture seule.
- Actions : garde membre → décryptage token DANS l'action (pattern chaine
  actuel), jamais côté client.

## Hors scope (chantier 2 premium)

Post quotidien auto du menu, programmation/séries, écho statut→chaîne, boutons
interactifs sur posts chaîne, stats de vues.

## Vérification

Tests whapi (3 méthodes défensives), web (composer par type, validations,
album cap/throttle, upload direct vidéo), revue inline (token flow, gating).
Deploy. Test réel Franck : détecter/rattacher SA chaîne existante en admin,
puis publier texte/photo/album depuis /app/marketing/chaine.
