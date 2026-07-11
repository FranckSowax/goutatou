# Menu Studio (A) + Suppléments (B) + Photos bot (C) — Design

Date : 2026-07-11
Statut : validé (Franck : séquence A→B→C, lots mergés/déployés séparément ; le bot PROPOSE les suppléments en conversation)

## Intention

Le menu du dashboard devient la **source unique et riche** du produit : c'est lui que la
LP scrollytelling affiche (déjà câblé) et que le bot WhatsApp sert en conversation
(texte aujourd'hui, photos au lot C). Trois lots, trois branches, trois déploiements.

Chantier « imprimante » : PARQUÉ au backlog (design présenté, non lancé — attente feu).

---

## Lot A — Menu Studio (UI, zéro migration)

Refonte de `/app/menu` : la grille de cartes devient un **studio en table**.

### Structure
- **Sections par catégorie** (en-tête : nom éditable inline, compteur, poignée de
  réordonnancement, suppression si vide) ; bouton « Nouvelle catégorie » conservé.
- **Lignes plats** : poignée dnd · vignette photo 40px (placeholder sinon) · nom ·
  prix FCFA · dispo (toggle existant) · actions (Éditer, Supprimer-dialog existant).
- **Drag & drop** : réordonner les plats dans une catégorie, **déplacer un plat vers
  une autre catégorie** (drop sur la section), réordonner les catégories. Persistance
  via les colonnes `position` existantes (menu_items.position, menu_categories.position)
  + `category_id` pour le déplacement. Lib : **@dnd-kit/core + @dnd-kit/sortable**
  (nouvelle dep justifiée : dnd tactile fiable — tablettes).
- **Dialog Éditer** : nom, prix, description, catégorie (select), photo (upload via
  l'action existante, limite 4 Mo déjà posée) ; l'upload photo reste inchangé.
- Optimistic UI locale pendant le drag + `router.refresh()` après persistance ;
  en cas d'échec d'action → retour à l'état serveur + message FR.

### Nouvelles server actions (RLS membre, pattern des actions menu existantes)
`updateItem(id, fields)`, `reorderItems(categoryId, orderedIds)`,
`moveItem(id, toCategoryId, orderedIds)`, `renameCategory(id, name)`,
`deleteCategory(id)` (refus FR si non vide), `reorderCategories(orderedIds)`.
Positions réécrites en batch (boucle d'updates — volumes menu, acceptable).

### Invariants A
LP intouchée (elle lit categories/items/position — le dnd la réordonne donc
automatiquement) ; actions existantes create/delete/toggle/photo conservées ;
aucune migration ; tokens/FR/light+dark.

---

## Lot B — Suppléments (migration + LP + bot)

- **Migration 0014** : `menu_supplements (id, restaurant_id, menu_item_id fk cascade,
  name, price int, position, available bool)` + RLS tenant (pattern menu_items) + realtime
  non requis. pgTAP.
- **Menu Studio** : dans le dialog Éditer, section « Suppléments » (CRUD inline, dnd
  léger par position).
- **LP/panier** : à l'ajout d'un plat qui a des suppléments → picker (multi-sélection,
  prix additionnés) ; le panier stocke [{menuItemId, qty, supplementIds[]}].
- **create_order v2 (migration)** : `p_items jsonb` accepte `supplement_ids uuid[]` par
  item ; la fonction PRICE CÔTÉ SERVEUR les suppléments (jointure menu_supplements du
  même restaurant, disponibles), insère des lignes order_items « ↳ {nom supplément} »
  (qty = qty du parent, unit_price = prix supplément) juste après la ligne parent.
  Total = somme serveur. Sécurité : ids d'un autre resto/plat → ignorés (même politique
  que les items indisponibles). pgTAP.
- **Bot (machine à états)** : après capture d'un plat AVEC suppléments disponibles →
  état `SUPPLEMENTS` : « Avec supplément ? 0. Non · 1. Frites +1 000 F · … » (multi via
  réponses successives, 0/“non” pour finir). Machine pure testée (pattern états
  existants) ; le panier bot porte les supplementIds ; create_order v2 côté repo.
- **Confirmations/notifications** : le récap (bot, LP merci, WhatsApp confirmation,
  ticket kanban modal) affiche les lignes suppléments (elles arrivent naturellement
  via order_items).

## Lot C — Photos bot

- Commande MENU du bot : pour chaque plat AVEC photo → `sendMessageImage(chatId,
  photo_url, caption "Nom — prix FCFA")`, throttlé (délai existant anti-ban, cap N
  photos = plats disponibles, ordre du menu) ; plats sans photo : ligne texte groupée.
  Fallback complet texte si échec image. Config bot : `MENU_PHOTOS_MAX` (défaut 8).
- Aucun changement web.

## Vérification (par lot)

A : tests actions non requis (pattern existant) mais helpers de réordonnancement purs
testés (calcul des positions) ; QA dnd au pointeur en preview (contrôleur) light+dark ;
revue finale opus. B : pgTAP create_order v2 + suppléments ; tests machine bot ; revue
opus renforcée (fonction durcie + bot core). C : tests processor bot (mocks whapi).
