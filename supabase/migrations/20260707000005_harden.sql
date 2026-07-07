-- Harden multi-tenant isolation gaps found in phase 1 final review.

-- Gap 1: create_order is SECURITY DEFINER (bypasses RLS) and Postgres grants
-- EXECUTE to PUBLIC by default. PostgREST exposes it as an RPC, so any
-- authenticated dashboard user could forge orders into another tenant by
-- passing an arbitrary p_restaurant_id. Restrict execution to service_role
-- only (the WhatsApp bot uses the service_role client); the dashboard/web
-- app must not call this RPC directly.
revoke execute on function public.create_order(uuid, uuid, order_source, order_mode, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, order_source, order_mode, jsonb, uuid, text) to service_role;

-- Gap 2: migration 0004's tenant-scoped storage policies on storage.objects
-- rely on RLS being enabled by Supabase's default project setup. Make the
-- migration self-contained by asserting it explicitly (idempotent).
alter table storage.objects enable row level security;
