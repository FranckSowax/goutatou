-- Meta Pixel par restaurant (boucle catalogue → panier → pixel). L'id est PUBLIC par nature
-- (il finit dans le HTML de la LP) — pas un secret.
alter table public.restaurants add column if not exists meta_pixel_id text;
notify pgrst, 'reload schema';
