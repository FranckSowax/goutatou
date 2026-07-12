-- Groupe WhatsApp staff par restaurant (spec .superpowers/sdd/task-1-brief.md, tâche G1).
-- Miroir du couple wa_channel_id/wa_channel_invite (20260712000019_marketing.sql) mais pour un
-- groupe WhatsApp (createGroup/getGroupInvite), pas une chaîne (createNewsletter/getNewsletter).
alter table restaurants add column staff_group_id text, add column staff_group_invite text;
