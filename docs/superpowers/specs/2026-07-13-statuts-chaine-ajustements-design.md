# Ajustements Statuts + Carte chaîne — Design

Date : 2026-07-13
Statut : validé (Franck : feu carte menu + corrections statuts)

## Intention

Quatre ajustements web (aucun côté bot) : carte menu par upload sur la chaîne,
fix de l'upload d'image des statuts (404 Server Action), composer statuts en
2 colonnes égales avec aperçu plus grand, historique des statuts réagencé.

## 1. Chaîne — « Publier ma carte » = upload d'image (pas de série, pas de génération)

- Le type « Album/Carte » du composer chaîne devient **« Carte menu »** : le
  restaurateur **uploade UNE image** de sa carte (vidéo pattern : direct
  navigateur→storage, bucket status-media, path `${restaurantId}/`, ≤8 Mo,
  image/*) → action postChannelMenuCard(path, caption?) : valide le préfixe,
  résout l'URL publique, sendNewsletterImage(waChannelId, url, caption ??
  '📋 Notre carte — commandez sur WhatsApp !').
- Suppression de postChannelCatalog (série de photos) et de son bouton. Pas de
  persistance de la carte en v1 (upload à chaque publication ; persistance =
  backlog).

## 2. Fix upload image statut (404 Server Action)

- Cause : Server Action `uploadStatusMedia` dont l'id change à chaque build →
  un onglet ancien → 404. Fix durable : l'image passe en **direct
  navigateur→storage** (exactement comme la vidéo du même composer), plus de
  Server Action pour le fichier. `uploadStatusMedia` supprimée ; `createStatus`/
  `createStatusBatch` reçoivent déjà un `media` = chemin storage validé
  `${restaurantId}/` (comme la vidéo) — aligner l'image dessus.

## 3. Composer statuts — 2 colonnes égales, aperçu plus grand

- Layout actuel `lg:grid-cols-[1fr_auto]` (aperçu étroit à droite) →
  `lg:grid-cols-2` (deux colonnes de largeur égale) : formulaire à gauche,
  aperçu 9:16 à droite AGRANDI (occupe toute la colonne, `max-w-sm mx-auto`
  au lieu d'une vignette). Responsive : empilé en mobile.

## 4. Historique statuts réagencé

- L'historique (board.tsx) : passer d'une liste dense à des **cartes cliquables**
  ouvrant l'aperçu large en dialog (déjà en place ?) + **pagination** (boutons
  « Précédent / Suivant », 8 par page côté client sur les données déjà chargées)
  OU un **dropdown de filtre par statut** (draft/scheduled/posted/failed). Choix
  d'implémentation : filtre dropdown par état + pagination boutons — plus lisible
  que la liste longue. Aperçu au clic = même StatusPreview large.

## Hors scope

Validation gérant des statuts auto (chantier B séparé), persistance de la carte
menu, génération d'image menu.

## Vérification

Tests web (validation upload image path, postChannelMenuCard, pagination pure),
gate complet, revue inline. Deploy. Test réel Franck (upload carte + image statut
une fois le plan Whapi payant actif).
