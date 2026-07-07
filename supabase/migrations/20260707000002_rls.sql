create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create or replace function is_member(p_restaurant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurant_members
    where user_id = auth.uid() and restaurant_id = p_restaurant_id
  ) or is_platform_admin();
$$;

alter table restaurants enable row level security;
alter table platform_admins enable row level security;
alter table restaurant_members enable row level security;
alter table whapi_channels enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table customers enable row level security;
alter table conversations enable row level security;
alter table drive_slots enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table message_logs enable row level security;
alter table subscriptions enable row level security;

create policy restaurants_select on restaurants for select using (is_member(id));
create policy restaurants_admin_all on restaurants for all
  using (is_platform_admin()) with check (is_platform_admin());

create policy members_select on restaurant_members for select
  using (user_id = auth.uid() or is_platform_admin());
create policy members_admin_all on restaurant_members for all
  using (is_platform_admin()) with check (is_platform_admin());

create policy admins_self on platform_admins for select using (user_id = auth.uid());

-- Tables métier : membres du tenant (lecture/écriture), admin plateforme inclus via is_member
create policy tenant_all_whapi on whapi_channels for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_cat on menu_categories for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_items on menu_items for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_customers on customers for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_conv on conversations for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_slots on drive_slots for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_orders on orders for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_oitems on order_items for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_logs on message_logs for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_subs on subscriptions for select using (is_member(restaurant_id));
create policy subs_admin_all on subscriptions for all
  using (is_platform_admin()) with check (is_platform_admin());
