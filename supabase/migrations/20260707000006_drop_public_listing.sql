-- Advisor 0025 (public_bucket_allows_listing): the broad SELECT policy
-- `menu_photos_read` on storage.objects lets any client LIST every file in the
-- public `menu-photos` bucket. Public buckets serve objects by direct public URL
-- WITHOUT consulting an RLS SELECT policy, so this policy is unnecessary for the
-- app (which stores/reads photos via getPublicUrl) and only enables enumeration
-- of every tenant's object paths. Drop it.
drop policy if exists menu_photos_read on storage.objects;
