-- Marketing v1 : opt-in explicite (mot-clé PROMOS) + chaîne WhatsApp (Channel/newsletter).
alter table customers add column marketing_opt_in boolean not null default false;
alter table restaurants add column wa_channel_id text, add column wa_channel_invite text;
