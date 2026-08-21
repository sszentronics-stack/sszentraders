-- 0017_cart_wishlist_recently_viewed.sql
-- Phase 5 (Persistent Cart, Wishlist & Shopping State).
--
-- Ownership model: every cart/wishlist/recently-viewed row hangs off
-- profiles.id, exactly like customers does (0002_profiles_customers.sql).
-- Both signed-in customers AND anonymous guests get a `profiles` row now
-- (see supabase/functions/_shared/callerAuth.ts) — Supabase Auth's
-- anonymous sign-in (supabase.auth.signInAnonymously, already scaffolded in
-- Phase 2's AuthContext.ensureGuestSession) gives a guest visitor a real
-- auth.uid() that current_profile_id() (0014_row_level_security.sql)
-- resolves exactly the same way as a permanent account. This is what lets a
-- guest cart persist across page loads/navigation without inventing a
-- second, parallel "guest session token" identity system.
--
-- Money: cart_items.unit_price_snapshot is informational only (what the
-- price was when the item was added/last touched), never authoritative —
-- backend/services/cart/cart.service.ts always re-reads the live
-- product_variants.price at read/checkout time and flags the difference.
-- This matches the "never trust totals sent by the browser" rule and the
-- phase-3-established price/product validation requirement.

create table carts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'merged', 'converted', 'abandoned')),
  currency text not null default 'PKR',
  last_activity_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_carts_updated_at
  before update on carts
  for each row execute function set_updated_at();

-- At most one ACTIVE cart per profile. A profile may accumulate historical
-- merged/converted/abandoned carts over time; those are exempt from this
-- constraint so merging never has to delete history to satisfy it.
create unique index idx_carts_profile_active on carts (profile_id) where status = 'active';
create index idx_carts_profile_id on carts (profile_id);

comment on table carts is 'One active cart per profile (guest or signed-in — see file header). Line items in cart_items; totals are always recomputed server-side from live product_variants, never trusted from a client payload.';

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts (id) on delete cascade,
  variant_id uuid not null references product_variants (id) on delete cascade,
  quantity integer not null check (quantity > 0 and quantity <= 999),
  unit_price_snapshot bigint not null check (unit_price_snapshot >= 0),
  added_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_cart_items_updated_at
  before update on cart_items
  for each row execute function set_updated_at();

-- One line per variant per cart; repeated "add to cart" of the same variant
-- increments quantity on this row instead of creating duplicate lines.
create unique index idx_cart_items_cart_variant on cart_items (cart_id, variant_id);
create index idx_cart_items_cart_id on cart_items (cart_id);
create index idx_cart_items_variant_id on cart_items (variant_id);

comment on column cart_items.unit_price_snapshot is 'Price (minor units) at the moment this line was last added/updated — display/audit only. cart.service.ts always re-validates against the live product_variants.price before returning totals or allowing checkout.';

-- Lightweight event trail for abandoned-cart/retention workflows (a later
-- phase's job to act on — this phase only lays the foundation, per spec:
-- "without sending campaigns yet"). Deliberately narrow: no PII duplicated
-- here beyond the cart/profile reference.
create table cart_events (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts (id) on delete cascade,
  event_type text not null check (event_type in ('created', 'item_added', 'item_updated', 'item_removed', 'cleared', 'merged', 'abandoned', 'recovered')),
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_cart_events_cart_id on cart_events (cart_id, created_at desc);

comment on table cart_events is 'Append-only cart activity trail. Foundation for a future abandoned-cart retention job (out of scope for Phase 5) — nothing reads this yet beyond admin diagnostics.';

create table wishlist_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index idx_wishlist_items_profile_product on wishlist_items (profile_id, product_id);
create index idx_wishlist_items_profile_id on wishlist_items (profile_id, created_at desc);

comment on table wishlist_items is 'Authenticated + guest wishlist (guest = anonymous-auth profile, same ownership model as carts). Revalidated against the live product/variant at read time so an unpublished/archived product is dropped from the rendered list rather than erroring.';

create table recently_viewed (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  viewed_at timestamptz not null default timezone('utc', now())
);

create unique index idx_recently_viewed_profile_product on recently_viewed (profile_id, product_id);
create index idx_recently_viewed_profile_id on recently_viewed (profile_id, viewed_at desc);

comment on table recently_viewed is 'Privacy-conscious "recently viewed" signal: capped to the most recent N per profile by backend/services/cart/recentlyViewed.service.ts (a periodic prune is unnecessary at this table''s expected size, but the service always trims on write).';

-- ---------------------------------------------------------------------------
-- Row Level Security. Same posture as orders/payments/shipments in
-- 0014_row_level_security.sql: self-read for defense in depth, but every
-- WRITE goes through the `cart` Edge Function (service role), which
-- re-validates price/variant/product state before touching a row — never a
-- direct client insert/update policy for money-bearing cart rows.
-- ---------------------------------------------------------------------------

alter table carts enable row level security;
alter table cart_items enable row level security;
alter table cart_events enable row level security;
alter table wishlist_items enable row level security;
alter table recently_viewed enable row level security;

create policy carts_self_read on carts
  for select using (profile_id = current_profile_id());
create policy carts_admin_all on carts
  for all using (is_admin()) with check (is_admin());

create policy cart_items_self_read on cart_items
  for select using (
    exists (select 1 from carts c where c.id = cart_items.cart_id and c.profile_id = current_profile_id())
  );
create policy cart_items_admin_all on cart_items
  for all using (is_admin()) with check (is_admin());

create policy cart_events_admin_all on cart_events
  for all using (is_admin()) with check (is_admin());

create policy wishlist_items_self_read on wishlist_items
  for select using (profile_id = current_profile_id());
create policy wishlist_items_admin_all on wishlist_items
  for all using (is_admin()) with check (is_admin());

create policy recently_viewed_self_read on recently_viewed
  for select using (profile_id = current_profile_id());
create policy recently_viewed_admin_all on recently_viewed
  for all using (is_admin()) with check (is_admin());
