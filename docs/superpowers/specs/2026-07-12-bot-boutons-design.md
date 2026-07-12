# Bot boutons + suppléments sur panier natif — Design

Date : 2026-07-12
Statut : validé (Franck : « feu boutons » après analyse MCP)

## Intention

Les questions à choix fermés du bot (mode, suppléments, confirmation) deviennent
des **boutons WhatsApp** (quick-reply ≤3 choix, liste au-delà), avec **fallback
texte numéroté systématique** (les boutons Whapi sont documentés instables sur
canaux web). Et le **panier catalogue natif** passe désormais par la proposition
de suppléments avant le choix du mode — la limite v1 tombe.

## whapi client

- `sendQuickReplies(to, bodyText, buttons: {id, title}[] ≤3)` —
  sendMessageInteractive type 'button', action.buttons quick_reply plats
  (title/id à plat, jamais imbriqués — règle anti-hallucination du skill).
- `sendList(to, bodyText, buttonLabel, rows: {id, title, description?}[] ≤10)` —
  type 'list', action.list.label + sections[0].rows.
- Webhooks entrants : shapes des réponses bouton (type 'reply' →
  reply.buttons_reply.{id,title}) et liste (reply.list_reply) À VÉRIFIER sur
  la doc incoming officielle (celle qui a déjà servi pour order/location).

## Convention des ids de boutons

`in:<texte>` — le tap est retraduit par le processor en entrée machine texte
(ex. bouton « Sur place » id `in:3` → la machine reçoit « 3 »). La machine
reste 100 % intouchée par les boutons.

## Machine (2 ajouts purs, TDD)

- `CartItem` gagne `suppAsked?: boolean` (transient, défaut absent, ignoré
  partout ailleurs).
- Nouvel état `SUPPLEMENTS_CHECKOUT` : mêmes règles de sélection que
  SUPPLEMENTS (numéro valide → ajoute au DERNIER item, dédup, re-prompt ;
  invalide → re-prompt) mais la sortie (`0`/`non`) marque le dernier item
  suppAsked puis : s'il reste un item du panier avec suppléments disponibles
  non demandés → le faire passer en dernière position et re-prompter (même
  état) ; sinon → état MODE avec récap panier + chooseMode (sorties identiques
  au beginCheckout actuel).
- `beginCheckout(cart, ctx)` évolue : si au moins un item du panier a des
  suppléments disponibles → place le premier en dernière position et retourne
  SUPPLEMENTS_CHECKOUT + supplementsPrompt ; sinon comportement actuel (MODE).
  Le flux texte (valider) n'est PAS branché sur ce nouvel état (zéro régression
  du parcours actuel).

## Processor

- **Sortie interactive** : après une transition, si l'état résultant est
  MODE / SUPPLEMENTS / SUPPLEMENTS_CHECKOUT / CONFIRMATION (lire la machine
  pour la question exacte oui-non de confirmation), envoyer la DERNIÈRE réponse
  comme interactif : body = le texte actuel inchangé, boutons = les choix
  (mode : modes disponibles ; suppléments : chaque supplément + « Non merci » ;
  confirmation : Oui / Annuler). ≤3 choix → quick-reply ; 4-12 → liste.
  Échec d'envoi interactif → sendText du texte original (fallback, log
  `[buttons]`). Les autres réponses du lot partent en texte comme aujourd'hui.
- **Entrée** : messages type 'reply' → extraire l'id ; préfixe `in:` → input
  machine ; sinon fallback title. logMessage 'in' = le title (lisible dans
  Conversations). Flux texte inchangé pour tout le reste.
- **Panier natif** : handleNativeOrder appelle beginCheckout (qui gère
  désormais les suppléments) — rien d'autre à changer côté commande.

## Hors scope

Sondages-comme-boutons (repli si les quick-reply se révèlent instables en réel
— décision après le test de Franck), boutons sur le menu complet (liste des
plats — le catalogue couvre ce besoin).

## Vérification

Tests whapi (2 méthodes, payloads exacts), machine (SUPPLEMENTS_CHECKOUT :
enchaînement multi-items, suppAsked, sortie MODE identique, beginCheckout
avec/sans suppléments, non-régression SUPPLEMENTS/valider), processor
(interactif envoyé par état, fallback texte sur échec, reply → input, panier
natif avec suppléments bout-en-bout). Deploy Railway puis TEST RÉEL Franck :
panier natif avec Poulet DG (a des suppléments) → boutons.
