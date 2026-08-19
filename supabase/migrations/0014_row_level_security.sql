-- 0014_row_level_security.sql
-- Intentional, deny-by-default RLS. Nothing in this migration grants broad
-- "allow everything" access.
--
-- Roles used:
--   anon          — unauthenticated storefront visitors (Vite app using the anon key).
--   authenticated — logged-in Supabase Auth users (customers).
--   service_role  — used ONLY inside Supabase Edge Functions. Postgres grants
--                    service_role BYPASSRLS by default in Supabase projects,
--                    so it does not need explicit policies here. The
--                    service-role key must never reach browser code (see
--                    src/lib/supabase/client.ts vs supabase/functions/_shared/supabaseAdmin.ts).
--
-- Admin role: a simple boolean flag on profiles (is_admin) for Phase 1.
-- This is intentionally minimal — a richer role/permission model can replace
-- it later (Phase 12, Admin Operations Dashboard) without breaking the RLS
-- shape established here.

alter table profiles add column is_admin boolean not null default false;

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from profiles p where p.auth_user_id = auth.uid()),
    false
  );
$$;

create or replace function current_profile_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.id from profiles p where p.auth_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Catalog: public read of published content, admin-only writes.
-- ---------------------------------------------------------------------------

alter table brands enable row level security;
alter table categories enable row level security;
alter table collections enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table product_images enable row level security;
alter table product_categories enable row level security;
alter table product_collections enable row level security;

create policy brands_public_read on brands
  for select using (status = 'published');
create policy brands_admin_all on brands
  for all using (is_admin()) with check (is_admin());

create policy categories_public_read on categories
  for select using (status = 'published');
create policy categories_admin_all on categories
  for all using (is_admin()) with check (is_admin());

create policy collections_public_read on collections
  for select using (status = 'published');
create policy collections_admin_all on collections
  for all using (is_admin()) with check (is_admin());

create policy products_public_read on products
  for select using (status = 'published');
create policy products_admin_all on products
  for all using (is_admin()) with check (is_admin());

create policy product_variants_public_read on product_variants
  for select using (
    status = 'published'
    and exists (select 1 from products p where p.id = product_variants.product_id and p.status = 'published')
  );
create policy product_variants_admin_all on product_variants
  for all using (is_admin()) with check (is_admin());

create policy product_images_public_read on product_images
  for select using (
    exists (select 1 from products p where p.id = product_images.product_id and p.status = 'published')
  );
create policy product_images_admin_all on product_images
  for all using (is_admin()) with check (is_admin());

create policy product_categories_public_read on product_categories
  for select using (
    exists (select 1 from products p where p.id = product_categories.product_id and p.status = 'published')
  );
create policy product_categories_admin_all on product_categories
  for all using (is_admin()) with check (is_admin());

create policy product_collections_public_read on product_collections
  for select using (
    exists (select 1 from products p where p.id = product_collections.product_id and p.status = 'published')
  );
create policy product_collections_admin_all on product_collections
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Identity: customers can read/write only their own data.
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table customers enable row level security;
alter table customer_addresses enable row level security;

create policy profiles_self_read on profiles
  for select using (auth_user_id = auth.uid());
create policy profiles_self_update on profiles
  for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy profiles_admin_all on profiles
  for all using (is_admin()) with check (is_admin());

create policy customers_self_read on customers
  for select using (profile_id = current_profile_id());
create policy customers_self_update on customers
  for update using (profile_id = current_profile_id()) with check (profile_id = current_profile_id());
create policy customers_admin_all on customers
  for all using (is_admin()) with check (is_admin());

create policy customer_addresses_self_all on customer_addresses
  for all
  using (
    exists (select 1 from customers c where c.id = customer_addresses.customer_id and c.profile_id = current_profile_id())
  )
  with check (
    exists (select 1 from customers c where c.id = customer_addresses.customer_id and c.profile_id = current_profile_id())
  );
create policy customer_addresses_admin_all on customer_addresses
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Commerce: customers can read only their own orders/order data.
-- Order/payment/shipment/return WRITES are privileged and go through
-- Edge Functions using the service role — no direct client insert/update
-- policies are granted here beyond narrow, safe cases.
-- ---------------------------------------------------------------------------

alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table payments enable row level security;
alter table payment_events enable row level security;
alter table shipments enable row level security;
alter table shipment_events enable row level security;
alter table returns enable row level security;
alter table return_items enable row level security;
alter table return_events enable row level security;

create policy orders_self_read on orders
  for select using (
    customer_id in (select c.id from customers c where c.profile_id = current_profile_id())
  );
create policy orders_admin_all on orders
  for all using (is_admin()) with check (is_admin());

create policy order_items_self_read on order_items
  for select using (
    exists (
      select 1 from orders o
      join customers c on c.id = o.customer_id
      where o.id = order_items.order_id and c.profile_id = current_profile_id()
    )
  );
create policy order_items_admin_all on order_items
  for all using (is_admin()) with check (is_admin());

create policy order_status_history_self_read on order_status_history
  for select using (
    exists (
      select 1 from orders o
      join customers c on c.id = o.customer_id
      where o.id = order_status_history.order_id and c.profile_id = current_profile_id()
    )
  );
create policy order_status_history_admin_all on order_status_history
  for all using (is_admin()) with check (is_admin());

create policy payments_self_read on payments
  for select using (
    exists (
      select 1 from orders o
      join customers c on c.id = o.customer_id
      where o.id = payments.order_id and c.profile_id = current_profile_id()
    )
  );
create policy payments_admin_all on payments
  for all using (is_admin()) with check (is_admin());

create policy payment_events_admin_all on payment_events
  for all using (is_admin()) with check (is_admin());

create policy shipments_self_read on shipments
  for select using (
    exists (
      select 1 from orders o
      join customers c on c.id = o.customer_id
      where o.id = shipments.order_id and c.profile_id = current_profile_id()
    )
  );
create policy shipments_admin_all on shipments
  for all using (is_admin()) with check (is_admin());

create policy shipment_events_admin_all on shipment_events
  for all using (is_admin()) with check (is_admin());

create policy returns_self_read on returns
  for select using (customer_id in (select c.id from customers c where c.profile_id = current_profile_id()));
create policy returns_admin_all on returns
  for all using (is_admin()) with check (is_admin());

create policy return_items_admin_all on return_items
  for all using (is_admin()) with check (is_admin());

create policy return_events_admin_all on return_events
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Fully internal tables: admin/service-role only. No anon/authenticated
-- policy is created at all, which means RLS denies all client access by
-- default (service_role bypasses RLS entirely for Edge Functions).
-- ---------------------------------------------------------------------------

alter table campaigns enable row level security;
alter table promotions enable row level security;
alter table coupons enable row level security;
alter table discounts enable row level security;
alter table local_financial_transactions enable row level security;
alter table erp_sync_jobs enable row level security;
alter table erp_sync_events enable row level security;
alter table inventory_cache enable row level security;
alter table idempotency_keys enable row level security;
alter table audit_logs enable row level security;

create policy campaigns_public_read on campaigns for select using (status = 'active');
create policy campaigns_admin_all on campaigns for all using (is_admin()) with check (is_admin());

create policy promotions_public_read on promotions for select using (status = 'active');
create policy promotions_admin_all on promotions for all using (is_admin()) with check (is_admin());

-- Coupons are intentionally NOT publicly readable/listable (would let anyone
-- enumerate active codes); validation happens server-side in a future
-- Edge Function that checks a submitted code against this table using the
-- service role.
create policy coupons_admin_all on coupons for all using (is_admin()) with check (is_admin());

create policy discounts_admin_all on discounts for all using (is_admin()) with check (is_admin());
create policy local_financial_transactions_admin_all on local_financial_transactions for all using (is_admin()) with check (is_admin());
create policy erp_sync_jobs_admin_all on erp_sync_jobs for all using (is_admin()) with check (is_admin());
create policy erp_sync_events_admin_all on erp_sync_events for all using (is_admin()) with check (is_admin());
create policy inventory_cache_admin_all on inventory_cache for all using (is_admin()) with check (is_admin());
create policy idempotency_keys_admin_all on idempotency_keys for all using (is_admin()) with check (is_admin());
create policy audit_logs_admin_all on audit_logs for all using (is_admin()) with check (is_admin());
