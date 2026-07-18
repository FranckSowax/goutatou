-- Rapports d'analyse (page Analyses) : archive des insights IA générés par le worker bot
-- (quotidien/hebdo/mensuel). Le détail des KPIs est recalculé en direct côté web ; ici on
-- stocke la sortie Mistral + quelques chiffres clés archivés.
create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_type text not null check (period_type in ('day','week','month')),
  period_start date not null,
  period_end date not null,
  headline jsonb not null default '{}'::jsonb,
  ai_insights jsonb not null default '{}'::jsonb,
  model text,
  generated_at timestamptz not null default now(),
  unique (restaurant_id, period_type, period_start)
);
create index if not exists analysis_reports_lookup_idx
  on public.analysis_reports(restaurant_id, period_type, period_start desc);

alter table public.analysis_reports enable row level security;
drop policy if exists tenant_all_analysis_reports on public.analysis_reports;
create policy tenant_all_analysis_reports on public.analysis_reports for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));

notify pgrst, 'reload schema';
