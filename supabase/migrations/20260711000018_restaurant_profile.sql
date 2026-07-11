-- Fiche restaurant + messages bot (étape 1 du paramétrage par restaurant).
-- Tous nullables : null = comportement actuel (accueil par défaut, pas de bloc infos).
alter table restaurants
  add column address text,
  add column contact_phone text,
  add column hours_text text,
  add column delivery_info text,
  add column bot_welcome text,
  add column bot_info_extra text;
