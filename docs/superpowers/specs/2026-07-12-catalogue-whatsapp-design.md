# Catalogue WhatsApp natif — Design

Date : 2026-07-12
Statut : validé (Franck : « feu catalogue », requis saisis dans l'admin)

## Intention

Le Menu Studio devient la source du **catalogue WhatsApp Business natif** du
numéro du resto : produits synchronisés (photos, prix XAF, descriptions), carte
catalogue envoyée en conversation, et **panier WhatsApp natif accepté comme
commande** (le client compose son panier dans WhatsApp → le bot le récupère et
enchaîne sur le choix du mode). Prérequis pilotés depuis la fiche admin.

## Modèle (migration 0021)

- `menu_items.wa_product_id text` (id produit WhatsApp après sync).
- `restaurants.catalog_enabled boolean not null default false`,
  `catalog_sync_requested_at timestamptz`, `catalog_synced_at timestamptz`,
  `catalog_sync_error text`.

## Sync (worker bot `catalog-sync`, pattern maison)

- Déclenchement : bouton admin « Synchroniser maintenant » pose
  catalog_sync_requested_at ; worker (poll CATALOG_SYNC_POLL_MS défaut 60 s,
  claim-first : requested_at non null et > synced_at) exécute puis écrit
  synced_at + error (null si OK).
- Sync par resto (canal actif requis) : pour chaque plat DISPONIBLE →
  createProduct/updateProduct Whapi (retailer_id = menu_item.id, name, price,
  currency 'XAF', description, image = photo_url si présente) ; wa_product_id
  stocké ; produits Whapi dont le retailer_id ne correspond plus à un plat
  disponible → deleteProduct. Throttle entre appels (délais campagnes).
  Échec par produit : log + continue ; échec global : catalog_sync_error FR.
- Endpoints exacts (createProduct/updateProduct/deleteProduct/getProducts/
  sendCatalog/getOrderItems) : VÉRIFIER doc skill whapi / source whapi-mcp.

## Conversation

- « menu » avec catalog_enabled ET une sync réussie : le bot envoie le menu
  texte PUIS la carte catalogue native (sendCatalog) À LA PLACE des photos
  individuelles (le catalogue les contient). catalog_enabled false → photos
  actuelles inchangées (non-régression).
- **Panier natif entrant** : message webhook type 'order' (shape à vérifier :
  order.id) → processor getOrderItems → mapping retailer_id → menu_items
  (indisponibles/inconnus droppés, politique v1) → si panier non vide :
  nouvelle fonction machine PURE `beginCheckout(cart, ctx)` (TDD) qui retourne
  l'état MODE + récap panier + question mode (mêmes textes que le flux actuel).
  Panier vide après mapping → message FR « Ces articles ne sont plus
  disponibles. » LIMITE V1 assumée : pas de proposition de suppléments sur les
  commandes issues du panier natif (documentée).

## Admin (fiche restaurant — nouvel onglet « Catalogue »)

- Prérequis affichés : compte business (health.user.is_business via l'action
  admin, à la demande), canal actif, nombre de plats avec photo.
- Toggle « Catalogue activé » (catalog_enabled), bouton « Synchroniser
  maintenant » (pose requested_at, feedback « Synchronisation demandée —
  effective sous une minute »), état : dernière sync, nb produits liés
  (count wa_product_id), dernière erreur FR éventuelle.
- Actions admin : garde is_platform_admin, décryptage token DANS l'action
  (health check), aucune donnée sensible côté client.

## Hors scope (backlog)

Collections par catégorie, sync auto sur modification du menu (bouton manuel v1),
suppléments sur panier natif, sendProduct unitaire en conversation.

## Vérification

Tests whapi (méthodes catalogue + confiance par endpoint), worker sync (diff
create/update/delete, throttle, claim, erreurs), beginCheckout (TDD machine),
processor order entrant (mapping, drop, vide), web (onglet, actions), revue
opus (sync = écritures de masse sur compte WhatsApp du resto + nouveau chemin
de commande), migration prod, deploys, smoke : sync Chez Demo réelle (canal
SPDRMN actif, compte business confirmé) puis « menu » sur WhatsApp.
