-- Sondages & quiz WhatsApp (spec docs/superpowers/specs/2026-07-12-sondages-design.md).
-- target 'channel' : envoi unique vers la chaîne WhatsApp du resto ; 'optin' : envoi à chaque
-- client marketing_opt_in = true AND opted_out = false. status : claim-first (queued → sending
-- → sent/failed) consommé par le worker bot poll-worker. quiz_correct null = sondage simple,
-- sinon index 0-based de la bonne réponse (envoi via sendQuiz au lieu de sendPoll).
create table polls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  question text not null,
  options jsonb not null,               -- ["Oui","Non",...] 2 à 12 entrées
  quiz_correct int,                     -- null = sondage ; sinon index 0-based de la bonne réponse
  target text not null check (target in ('channel','optin')),
  status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  sent_count int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table polls enable row level security;
create policy tenant_all_polls on polls for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
