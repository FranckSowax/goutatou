-- Catalogue WhatsApp natif (spec docs/superpowers/specs/2026-07-12-catalogue-whatsapp-design.md).
-- wa_product_id : id produit WhatsApp après sync (createProduct/updateProduct Whapi, retailer_id
-- = menu_item.id). catalog_enabled : prérequis pour la sync + bascule menu texte+carte vs photos.
-- catalog_sync_requested_at/synced_at/error : claim-first pour le worker bot catalog-sync (pattern
-- maison, cf. throttle campagnes) — requested_at non null et > synced_at déclenche une passe.
alter table menu_items add column wa_product_id text;

alter table restaurants
  add column catalog_enabled boolean not null default false,
  add column catalog_sync_requested_at timestamptz,
  add column catalog_synced_at timestamptz,
  add column catalog_sync_error text;
