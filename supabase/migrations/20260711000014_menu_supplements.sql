create table menu_supplements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  price integer not null check (price >= 0),
  available boolean not null default true,
  position integer not null default 0
);
create index menu_supplements_item_idx on menu_supplements (menu_item_id, position);
alter table menu_supplements enable row level security;
create policy tenant_all_menu_supplements on menu_supplements for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
