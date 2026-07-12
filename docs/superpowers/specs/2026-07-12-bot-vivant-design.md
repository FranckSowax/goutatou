# Bot vivant + GPS — Design

Date : 2026-07-12
Statut : validé (Franck : « chantier bot vivant 3 + 4 », pipeline ensuite catalogue → sondages → groupe staff)

## Intention

Rendre le bot « humain » (présence, réactions, accusés de lecture) et géolocalisé
(carte du resto envoyée sur « infos », position GPS du client acceptée comme
adresse de livraison). Aucun changement de la machine à états (pure).

## Périmètre

### Bot humain (processor, best-effort partout — jamais bloquant)
- **Typing** : dès réception d'un message traité (canal actif, hors HUMAIN),
  envoyer la présence « typing » avant de répondre (endpoint presence Whapi —
  vérifier le chemin exact dans la doc du skill : sendPresence).
- **Accusé de lecture** : markMessageAsRead sur chaque message entrant traité.
- **Réaction ✅** : quand une commande est créée avec succès (create_order OK),
  réagir ✅ au message entrant qui a déclenché la confirmation (msg.id).
- Chaque effet dans son try/catch, log `[presence]`/`[react]` en cas d'échec,
  le flux de réponse n'attend PAS ces appels quand c'est évitable (fire and
  forget acceptable pour typing/read ; la réaction après confirmation peut être
  awaited best-effort).

### GPS sortant — carte du restaurant
- Migration 0020 : `restaurants.location_lat double precision, location_lng double precision`
  (nullables).
- Commande « infos » : si lat/lng renseignés, le processor envoie EN PLUS du bloc
  texte un message location Whapi (sendMessageLocation — position + nom du resto).
  La machine reste pure : le processor détecte la réponse infos (pattern
  isMenuCommand des photos) et ajoute l'effet.
- Saisie : fiche admin (onglet Général) + /app/reglages, champ unique
  « Position GPS » où on colle `lat, lng` (format Google Maps « 0.3901, 9.4544 »),
  parsé/validé (helper pur testé : deux nombres, lat ∈ [-90,90], lng ∈ [-180,180]),
  vide = effacer. Aide FR : « Clic droit sur Google Maps → copier les coordonnées ».

### GPS entrant — position du client en livraison
- Le webhook reçoit les messages de type location (vérifier le shape exact dans
  la doc du skill : message.location.latitude/longitude).
- Processor : un message location est transformé en entrée texte
  `https://maps.google.com/?q={lat},{lng}` passée telle quelle à la machine.
  Effet naturel : en état de saisie d'adresse (livraison), le lien devient
  l'adresse de la commande (cliquable dans le kanban et les notifs) ; dans les
  autres états, la machine répond « pas compris » comme pour tout texte libre.
- Les messages non-texte/non-location restent ignorés comme aujourd'hui.

## Hors scope
Rejet d'appels (7), catalogue (chantier suivant), toute modification machine.

## Vérification
Tests whapi (3-4 nouvelles méthodes mock-fetch), tests processor (typing appelé,
read appelé, react sur confirmation seulement, location→adresse, infos+carte,
échecs silencieux), helper GPS pur testé, gates complets, revue, migration prod
+ notify pgrst, deploys, smoke : fiche Chez Demo avec coordonnées Libreville.
