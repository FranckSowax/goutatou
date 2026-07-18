-- Note libre par client (CRM / page Clients). RLS déjà tenant (tenant_all_customers, migration 0002).
alter table public.customers add column if not exists notes text;
notify pgrst, 'reload schema';
