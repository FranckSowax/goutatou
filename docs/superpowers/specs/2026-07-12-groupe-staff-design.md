# Groupe staff WhatsApp — Design

Date : 2026-07-12
Statut : validé (Franck : « feu groupe staff », item 10, dernier du pipeline)

## Intention

Chaque restaurant peut créer un groupe WhatsApp « Cuisine {Resto} » depuis ses
réglages ; le staff le rejoint par lien d'invitation ; **chaque nouvelle
commande** (bot, LP, panier natif — toutes passent par create_order) y est
postée automatiquement en ticket texte. Le patron suit sans ouvrir le dashboard.

## Modèle (migration 0023)

`restaurants.staff_group_id text` (JID du groupe), `staff_group_invite text`.

## whapi client

`createGroup(name)` → { id } (POST /groups) ; `getGroupInvite(groupId)` →
{ invite } (GET /groups/{GroupID}/invite) — endpoints à vérifier (source
whapi-mcp : createGroup / getGroupInvite existent). L'envoi vers un groupe
réutilise sendText (JID @g.us).

## Notifier (bot)

- Le notifier écoute déjà le realtime orders — étendre aux INSERT (vérifier
  l'abonnement actuel : si UPDATE only, ajouter INSERT).
- Sur nouvelle commande : si restaurants.staff_group_id ET canal actif →
  charger order_items (tri position) + client → sendText au groupe :
  « 🧾 *Commande #N* — {Mode FR}\n{qty}× {name} (lignes ↳ incluses
  naturellement)\nTotal : X FCFA\nClient : {nom ou téléphone} » — best-effort
  (échec loggé `[staff-group]`, jamais bloquant).

## Web — /app/reglages, section « Groupe cuisine »

- Pas de groupe : bouton « Créer le groupe Cuisine {Resto} » (action : garde
  membre, token décrypté DANS l'action, createGroup + getGroupInvite, stocke
  id + invite via client admin — pattern 3A ; erreurs FR fixes ; anti
  double-clic par écriture conditionnelle .is('staff_group_id', null)).
- Groupe créé : lien d'invitation (copie + QR via lib/qr) + aide FR
  « Partagez ce lien à votre équipe » + note « Les nouvelles commandes y
  seront postées automatiquement ».

## Hors scope

Gestion des participants depuis le dashboard, post des changements de statut,
suppression du groupe (se gère dans WhatsApp).

## Vérification

Tests whapi (2 méthodes), notifier (ticket formaté, lignes ↳, sans groupe →
rien, échec silencieux), web (action + états). Smoke prod : deploys + le test
réel du bouton revient à Franck (création du groupe = action visible sur SON
compte WhatsApp — pas de smoke synthétique).
