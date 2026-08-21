-- Aura Beauty Care — combined schema
-- Generated: 2026-08-20T09:53:53.795Z
-- Source: supabase/migrations/*.sql (25 files)
--
-- HOW TO APPLY
-- 1. Open https://supabase.com/dashboard/project/jooukhdxxllutkdqznqt/sql/new
-- 2. Paste this entire file into the SQL Editor
-- 3. Click Run
--
-- Safe to re-run only on an empty/new project. On an existing DB, prefer
-- applying new migrations one file at a time.

-- =============================================================================
-- 0001_extensions_and_enums.sql
-- =============================================================================
-- 0001_extensions_and_enums.sql
-- Aura Beauty Care — Phase 1 foundation.
-- Extensions + shared enum types used across the schema.
--
-- Money convention (documented once, applies to every money column in this schema):
--   All monetary amounts are stored as BIGINT "minor units" of the row's currency
--   (e.g. PKR paisa, 1 PKR = 100 paisa), never as FLOAT/REAL/NUMERIC-with-implicit-
--   rounding. This keeps the convention currency-agnostic for future non-PKR
--   support and avoids binary floating point rounding errors in financial data.
--   Application code is responsible for formatting minor units back to major
--   units for display (see src/lib/money + backend/lib money helpers introduced
--   alongside this migration set).
--
-- Status convention (documented once):
--   We use Postgres ENUM types (rather than a lookup-table pattern) for the
--   small, rarely-changing status vocabularies below (order_status,
--   payment_status, fulfillment_status, etc.). Enums give us cheap storage,
--   type-level safety, and fast indexing/filtering, which fits fixed,
--   spec-defined state machines. A lookup-table pattern is preferable when
--   admins need to add/rename statuses at runtime without a migration; that
--   is not a requirement here, so enums are the simpler, more maintainable
--   choice. Adding a new enum value later is a small, reversible migration
--   (`ALTER TYPE ... ADD VALUE`).

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email/slug comparisons

-- Generic status for simple content entities (brands, categories, collections, products, variants, images).
create type content_status as enum ('draft', 'published', 'archived');

create type customer_status as enum ('active', 'inactive', 'blocked');

create type order_status as enum (
  'pending',
  'confirmed',
  'processing',
  'packed',
  'ready_for_pickup',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
  'refunded'
);

create type payment_status as enum (
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'partially_refunded',
  'refunded'
);

create type fulfillment_status as enum (
  'unfulfilled',
  'partially_fulfilled',
  'fulfilled',
  'returned',
  'cancelled'
);

create type payment_event_status as enum (
  'initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'
);

create type shipment_status as enum (
  'pending', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery',
  'delivered', 'failed_delivery', 'returned', 'cancelled'
);

create type return_status as enum (
  'requested', 'under_review', 'approved', 'rejected', 'pickup_requested',
  'in_transit', 'received', 'refunded', 'replaced', 'closed'
);

create type promotion_status as enum ('draft', 'active', 'paused', 'expired', 'archived');

create type erp_sync_status as enum ('pending', 'in_progress', 'succeeded', 'failed', 'skipped');

create type erp_provider as enum ('ledgix');
create type payment_provider_name as enum ('easypaisa', 'manual', 'cod');
create type courier_provider_name as enum ('leopards', 'manual');

-- Shared updated_at trigger helper.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- =============================================================================
-- 0002_profiles_customers.sql
-- =============================================================================
-- 0002_profiles_customers.sql
-- Profiles (1:1 with Supabase Auth users) and Customers (commerce identity,
-- may exist without a profile for guest checkout).

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  email citext,
  phone text,
  avatar_url text,
  status customer_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create index idx_profiles_auth_user_id on profiles (auth_user_id);
create index idx_profiles_email on profiles (email);

comment on table profiles is 'One row per Supabase Auth user. Holds identity/profile fields separate from commerce data (customers).';

-- Customers: the commerce identity. A customer may or may not be linked to a
-- profile (guest checkout creates a customer with profile_id = null).
create table customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id) on delete set null,
  customer_number text not null unique,
  first_name text,
  last_name text,
  email citext,
  phone text,
  date_of_birth date,
  marketing_opt_in boolean not null default false,
  status customer_status not null default 'active',
  ledgix_customer_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

create index idx_customers_profile_id on customers (profile_id);
create index idx_customers_email on customers (email);
create index idx_customers_phone on customers (phone);
create index idx_customers_status on customers (status);
create unique index idx_customers_ledgix_customer_id on customers (ledgix_customer_id) where ledgix_customer_id is not null;

comment on table customers is 'Commerce-facing customer identity. LedGix ERP is the eventual system of record for customer accounting; ledgix_customer_id links the two once ERP integration (Phase 8) is live.';
comment on column customers.ledgix_customer_id is 'Foreign reference to the customer record in LedGix ERP. Null until synced. Aura never invents or guesses this value.';

-- =============================================================================
-- 0003_customer_addresses.sql
-- =============================================================================
-- 0003_customer_addresses.sql
-- Pakistani-address-shaped, but not hard-locked to one city/country so the
-- schema can later serve other markets without a migration.

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  label text,                          -- e.g. "Home", "Office"
  recipient_name text not null,
  phone text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  province text,                       -- e.g. Punjab, Sindh (nullable: not every country uses province/state)
  postal_code text,
  country text not null default 'PK',
  landmark text,
  is_default_shipping boolean not null default false,
  is_default_billing boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_customer_addresses_updated_at
  before update on customer_addresses
  for each row execute function set_updated_at();

create index idx_customer_addresses_customer_id on customer_addresses (customer_id);

-- Only one default shipping / default billing address per customer.
create unique index uq_customer_addresses_default_shipping
  on customer_addresses (customer_id)
  where is_default_shipping;

create unique index uq_customer_addresses_default_billing
  on customer_addresses (customer_id)
  where is_default_billing;

-- =============================================================================
-- 0004_catalog_brands_categories_collections.sql
-- =============================================================================
-- 0004_catalog_brands_categories_collections.sql
-- Brands, hierarchical categories, and time-boxed collections.
-- No real category/collection data is seeded here — content is backend-driven.

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  logo_url text,
  website_url text,
  status content_status not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz
);

create trigger trg_brands_updated_at
  before update on brands
  for each row execute function set_updated_at();

create index idx_brands_slug on brands (slug);
create index idx_brands_status on brands (status);

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories (id) on delete set null,
  name text not null,
  slug citext not null unique,
  description text,
  image_url text,
  status content_status not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint chk_categories_not_self_parent check (parent_id is distinct from id)
);

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

create index idx_categories_slug on categories (slug);
create index idx_categories_parent_id on categories (parent_id);
create index idx_categories_status on categories (status);

create table collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  image_url text,
  status content_status not null default 'draft',
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint chk_collections_date_range check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create trigger trg_collections_updated_at
  before update on collections
  for each row execute function set_updated_at();

create index idx_collections_slug on collections (slug);
create index idx_collections_status on collections (status);

-- =============================================================================
-- 0005_products_variants_images.sql
-- =============================================================================
-- 0005_products_variants_images.sql
-- Products describe the sellable "concept"; inventory/price/SKU live on
-- product_variants (a product always has at least one variant in practice,
-- enforced at the application layer, not the DB, to keep migrations simple).

create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands (id) on delete set null,
  name text not null,
  slug citext not null unique,
  short_description text,
  description text,
  ingredients text,
  directions text,
  product_type text,
  status content_status not null default 'draft',
  is_featured boolean not null default false,
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz
);

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

create index idx_products_slug on products (slug);
create index idx_products_brand_id on products (brand_id);
create index idx_products_status on products (status);
create index idx_products_is_featured on products (is_featured) where is_featured;

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  sku text not null unique,
  barcode text,
  title text,                          -- e.g. "25g", "150ml"
  price bigint not null,               -- minor units, see 0001 comment
  compare_at_price bigint,
  cost_price bigint,
  currency text not null default 'PKR',
  weight numeric(10, 3),
  weight_unit text not null default 'g',
  attributes jsonb not null default '{}'::jsonb,
  status content_status not null default 'draft',
  ledgix_item_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint chk_product_variants_price_nonnegative check (price >= 0),
  constraint chk_product_variants_compare_at_nonnegative check (compare_at_price is null or compare_at_price >= 0),
  constraint chk_product_variants_cost_nonnegative check (cost_price is null or cost_price >= 0)
);

create trigger trg_product_variants_updated_at
  before update on product_variants
  for each row execute function set_updated_at();

create index idx_product_variants_product_id on product_variants (product_id);
create index idx_product_variants_sku on product_variants (sku);
create index idx_product_variants_status on product_variants (status);
create unique index uq_product_variants_ledgix_item_id on product_variants (ledgix_item_id) where ledgix_item_id is not null;

comment on column product_variants.price is 'Selling price in minor currency units (see 0001_extensions_and_enums.sql money convention).';
comment on column product_variants.ledgix_item_id is 'Foreign reference to the item/SKU record in LedGix ERP. Null until synced.';

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  variant_id uuid references product_variants (id) on delete cascade,
  storage_path text not null,          -- path within the `product-images` storage bucket
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_product_images_product_id on product_images (product_id);
create index idx_product_images_variant_id on product_images (variant_id);

create unique index uq_product_images_primary_per_product
  on product_images (product_id)
  where is_primary and variant_id is null;

-- Join tables (many-to-many): products <-> categories / collections.
create table product_categories (
  product_id uuid not null references products (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, category_id)
);

create index idx_product_categories_category_id on product_categories (category_id);

create table product_collections (
  product_id uuid not null references products (id) on delete cascade,
  collection_id uuid not null references collections (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, collection_id)
);

create index idx_product_collections_collection_id on product_collections (collection_id);

-- =============================================================================
-- 0006_orders.sql
-- =============================================================================
-- 0006_orders.sql
-- Orders, order line items (price/name snapshotted at time of order), and
-- status history. No hard deletes: orders are never removed, only
-- status-transitioned or archived.

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references customers (id) on delete set null, -- nullable: guest checkout
  email citext,
  phone text,
  currency text not null default 'PKR',
  subtotal bigint not null default 0,
  discount_total bigint not null default 0,
  shipping_total bigint not null default 0,
  tax_total bigint not null default 0,
  grand_total bigint not null default 0,
  order_status order_status not null default 'pending',
  payment_status payment_status not null default 'pending',
  fulfillment_status fulfillment_status not null default 'unfulfilled',
  payment_method text,                 -- free-form until Phase 10 (e.g. 'cod', 'easypaisa', 'whatsapp_manual')
  source text not null default 'web',  -- 'web' | 'whatsapp' | 'mobile' | 'admin'
  customer_notes text,
  internal_notes text,
  ledgix_invoice_id text,
  ledgix_invoice_number text,
  placed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint chk_orders_totals_nonnegative check (
    subtotal >= 0 and discount_total >= 0 and shipping_total >= 0 and
    tax_total >= 0 and grand_total >= 0
  )
);

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

create index idx_orders_customer_id on orders (customer_id);
create index idx_orders_order_status on orders (order_status);
create index idx_orders_payment_status on orders (payment_status);
create index idx_orders_placed_at on orders (placed_at);
create index idx_orders_email on orders (email);
create index idx_orders_phone on orders (phone);
create unique index uq_orders_ledgix_invoice_id on orders (ledgix_invoice_id) where ledgix_invoice_id is not null;

comment on table orders is 'Local operational order record. LedGix ERP is the eventual accounting source of truth once Phase 8 lands; ledgix_invoice_id/number are the reference back to the authoritative ERP document.';

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  variant_id uuid references product_variants (id) on delete set null,
  sku text not null,
  product_name text not null,          -- snapshot: never rely on joining current product name
  variant_name text,                   -- snapshot
  quantity integer not null,
  unit_price bigint not null,          -- snapshot of variant price at order time (minor units)
  original_price bigint,               -- snapshot of pre-discount price, if different
  discount_amount bigint not null default 0,
  line_total bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chk_order_items_quantity_positive check (quantity > 0),
  constraint chk_order_items_amounts_nonnegative check (
    unit_price >= 0 and discount_amount >= 0 and line_total >= 0
  )
);

create index idx_order_items_order_id on order_items (order_id);
create index idx_order_items_product_id on order_items (product_id);
create index idx_order_items_variant_id on order_items (variant_id);
create index idx_order_items_sku on order_items (sku);

comment on table order_items is 'Line items snapshot product/variant name and price at order time — never join current product data to compute historical order totals.';

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  note text,
  changed_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_order_status_history_order_id on order_status_history (order_id);
create index idx_order_status_history_created_at on order_status_history (created_at);

-- =============================================================================
-- 0007_payments.sql
-- =============================================================================
-- 0007_payments.sql
-- Payment model only — no live Easypaisa integration in Phase 1.
-- payments = one row per attempted/settled payment against an order.
-- payment_events = the raw event/webhook trail behind each payment.

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  provider payment_provider_name not null,
  provider_transaction_id text,
  payment_method text,
  amount bigint not null,
  currency text not null default 'PKR',
  status payment_status not null default 'pending',
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_amount bigint not null default 0,
  ledgix_receipt_id text,
  ledgix_receipt_number text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chk_payments_amount_nonnegative check (amount >= 0),
  constraint chk_payments_refunded_nonnegative check (refunded_amount >= 0 and refunded_amount <= amount)
);

create trigger trg_payments_updated_at
  before update on payments
  for each row execute function set_updated_at();

create index idx_payments_order_id on payments (order_id);
create index idx_payments_status on payments (status);
create index idx_payments_provider_transaction_id on payments (provider_transaction_id);
create unique index uq_payments_ledgix_receipt_id on payments (ledgix_receipt_id) where ledgix_receipt_id is not null;

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments (id) on delete cascade,
  provider payment_provider_name not null,
  event_type text not null,            -- e.g. 'webhook_received', 'status_changed'
  status payment_event_status not null,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_payment_events_payment_id on payment_events (payment_id);
create index idx_payment_events_created_at on payment_events (created_at);

comment on table payments is 'Model only in Phase 1 — no live Easypaisa calls are made. Populated by future PaymentProvider implementations via Edge Functions.';

-- =============================================================================
-- 0008_shipments.sql
-- =============================================================================
-- 0008_shipments.sql
-- Shipment model only — no live Leopards integration in Phase 1.

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  provider courier_provider_name not null,
  tracking_number text,
  awb_number text,
  status shipment_status not null default 'pending',
  shipping_cost bigint,
  pickup_requested_at timestamptz,
  picked_up_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  provider_payload jsonb,
  provider_reference text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chk_shipments_shipping_cost_nonnegative check (shipping_cost is null or shipping_cost >= 0)
);

create trigger trg_shipments_updated_at
  before update on shipments
  for each row execute function set_updated_at();

create index idx_shipments_order_id on shipments (order_id);
create index idx_shipments_status on shipments (status);
create index idx_shipments_tracking_number on shipments (tracking_number);
create unique index uq_shipments_awb_number on shipments (awb_number) where awb_number is not null;

create table shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  provider courier_provider_name not null,
  event_type text not null,
  status shipment_status,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_shipment_events_shipment_id on shipment_events (shipment_id);
create index idx_shipment_events_created_at on shipment_events (created_at);

comment on table shipments is 'Model only in Phase 1 — no live Leopards calls are made. Populated by future CourierProvider implementations via Edge Functions.';

-- =============================================================================
-- 0009_returns.sql
-- =============================================================================
-- 0009_returns.sql
-- Schema only in Phase 1 — no returns workflow/UI yet (Phase 14).

create table returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  return_number text not null unique,
  status return_status not null default 'requested',
  reason text,
  customer_notes text,
  internal_notes text,
  refund_amount bigint,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  constraint chk_returns_refund_amount_nonnegative check (refund_amount is null or refund_amount >= 0)
);

create trigger trg_returns_updated_at
  before update on returns
  for each row execute function set_updated_at();

create index idx_returns_order_id on returns (order_id);
create index idx_returns_customer_id on returns (customer_id);
create index idx_returns_status on returns (status);

create table return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns (id) on delete cascade,
  order_item_id uuid not null references order_items (id) on delete cascade,
  quantity integer not null,
  reason text,
  refund_amount bigint,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chk_return_items_quantity_positive check (quantity > 0),
  constraint chk_return_items_refund_amount_nonnegative check (refund_amount is null or refund_amount >= 0)
);

create index idx_return_items_return_id on return_items (return_id);
create index idx_return_items_order_item_id on return_items (order_item_id);

create table return_events (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns (id) on delete cascade,
  from_status return_status,
  to_status return_status not null,
  note text,
  changed_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_return_events_return_id on return_events (return_id);

-- =============================================================================
-- 0010_promotions.sql
-- =============================================================================
-- 0010_promotions.sql
-- Foundation tables only — no discount engine/evaluation logic in Phase 1 (Phase 13).

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  status promotion_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_campaigns_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

create index idx_campaigns_status on campaigns (status);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns (id) on delete set null,
  name text not null,
  description text,
  discount_type text not null,         -- 'percentage' | 'fixed_amount' | 'free_shipping' (validated in app layer)
  discount_value bigint not null default 0,  -- percentage (0-100) or minor-unit amount, per discount_type
  status promotion_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chk_promotions_discount_value_nonnegative check (discount_value >= 0)
);

create trigger trg_promotions_updated_at
  before update on promotions
  for each row execute function set_updated_at();

create index idx_promotions_campaign_id on promotions (campaign_id);
create index idx_promotions_status on promotions (status);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions (id) on delete cascade,
  code citext not null unique,
  usage_limit integer,
  usage_limit_per_customer integer,
  times_used integer not null default 0,
  status promotion_status not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_coupons_updated_at
  before update on coupons
  for each row execute function set_updated_at();

create index idx_coupons_code on coupons (code);
create index idx_coupons_promotion_id on coupons (promotion_id);

create table discounts (
  -- Records an applied discount against a specific order (audit trail of what fired).
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  promotion_id uuid references promotions (id) on delete set null,
  coupon_id uuid references coupons (id) on delete set null,
  amount bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chk_discounts_amount_nonnegative check (amount >= 0)
);

create index idx_discounts_order_id on discounts (order_id);
create index idx_discounts_promotion_id on discounts (promotion_id);
create index idx_discounts_coupon_id on discounts (coupon_id);

-- =============================================================================
-- 0011_accounting_erp_sync.sql
-- =============================================================================
-- 0011_accounting_erp_sync.sql
-- Local operational accounting layer. This is NOT a competing ledger:
-- LedGix ERP is the eventual authoritative accounting system. These tables
-- record what Aura believes happened locally and track the sync lifecycle
-- to the ERP; the ERP document reference is stored once it exists.

create table local_financial_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete set null,
  payment_id uuid references payments (id) on delete set null,
  transaction_type text not null,      -- 'sale' | 'refund' | 'adjustment' (validated in app layer)
  amount bigint not null,
  currency text not null default 'PKR',
  description text,
  ledgix_document_id text,
  ledgix_document_number text,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_local_financial_transactions_order_id on local_financial_transactions (order_id);
create index idx_local_financial_transactions_payment_id on local_financial_transactions (payment_id);
create index idx_local_financial_transactions_occurred_at on local_financial_transactions (occurred_at);
create unique index uq_local_financial_transactions_ledgix_document_id
  on local_financial_transactions (ledgix_document_id) where ledgix_document_id is not null;

comment on table local_financial_transactions is 'Local operational record of financial events. LedGix ERP (Phase 8) is the authoritative accounting source of truth: Aura local record -> LedGix ERP -> ERP document -> Aura stores the ERP reference back here.';

-- Generic sync-job tracking, reusable for any ERP entity (customer, item,
-- invoice, receipt, inventory) and any future external system.
create table erp_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider erp_provider not null default 'ledgix',
  entity_type text not null,           -- 'customer' | 'product_variant' | 'order' | 'payment' | 'inventory'
  entity_id uuid not null,
  direction text not null default 'push', -- 'push' (Aura -> ERP) | 'pull' (ERP -> Aura)
  status erp_sync_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_erp_sync_jobs_updated_at
  before update on erp_sync_jobs
  for each row execute function set_updated_at();

create index idx_erp_sync_jobs_status on erp_sync_jobs (status);
create index idx_erp_sync_jobs_entity on erp_sync_jobs (entity_type, entity_id);
create index idx_erp_sync_jobs_provider on erp_sync_jobs (provider);

create table erp_sync_events (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid not null references erp_sync_jobs (id) on delete cascade,
  event_type text not null,            -- 'attempt_started' | 'attempt_failed' | 'attempt_succeeded' | 'manual_override'
  message text,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_erp_sync_events_sync_job_id on erp_sync_events (sync_job_id);
create index idx_erp_sync_events_created_at on erp_sync_events (created_at);

-- =============================================================================
-- 0012_inventory_cache.sql
-- =============================================================================
-- 0012_inventory_cache.sql
-- Cache only. LedGix ERP is the sole authoritative inventory source
-- (Phase 9). No local inventory-adjustment features exist in Phase 1 —
-- this table is written to only by the future ERP sync job.

create table inventory_cache (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants (id) on delete cascade,
  ledgix_item_id text,
  quantity_on_hand integer not null default 0,
  quantity_available integer not null default 0,
  quantity_reserved integer not null default 0,
  last_synced_at timestamptz,
  sync_status erp_sync_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_inventory_cache_variant_id unique (variant_id),
  constraint chk_inventory_cache_quantities_nonnegative check (
    quantity_on_hand >= 0 and quantity_available >= 0 and quantity_reserved >= 0
  )
);

create trigger trg_inventory_cache_updated_at
  before update on inventory_cache
  for each row execute function set_updated_at();

create index idx_inventory_cache_variant_id on inventory_cache (variant_id);
create index idx_inventory_cache_sync_status on inventory_cache (sync_status);
create unique index uq_inventory_cache_ledgix_item_id on inventory_cache (ledgix_item_id) where ledgix_item_id is not null;

comment on table inventory_cache is 'Synced operational copy of LedGix ERP inventory. Never independently authoritative — never mutate quantities here except from the ERP sync process.';

-- =============================================================================
-- 0013_idempotency_and_audit.sql
-- =============================================================================
-- 0013_idempotency_and_audit.sql
-- Idempotency keys: foundation for safe retries of order creation, refunds,
-- and future Easypaisa/ERP/Leopards callbacks.
-- Audit logs: append-only trail of sensitive actions. Never store
-- passwords/secrets/tokens here.

create table idempotency_keys (
  key text primary key,
  scope text not null,                 -- e.g. 'order.create', 'payment.easypaisa.webhook', 'erp.sync'
  request_hash text not null,          -- hash of the normalized request payload, to detect key reuse with different input
  response_reference text,             -- e.g. the created order id, stored once the operation completes
  status text not null default 'pending', -- 'pending' | 'completed' | 'failed'
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_idempotency_keys_scope on idempotency_keys (scope);
create index idx_idempotency_keys_expires_at on idempotency_keys (expires_at);

comment on table idempotency_keys is 'Generic idempotency ledger. Callers supply a client-generated key per logical operation; see backend/lib/idempotency for the helper.';

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor uuid,                          -- profiles.id or null for system/anonymous actions
  actor_type text not null default 'system', -- 'customer' | 'admin' | 'system' | 'integration'
  action text not null,                -- e.g. 'order.status_changed', 'auth.login', 'admin.product_updated'
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_audit_logs_actor on audit_logs (actor);
create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index idx_audit_logs_created_at on audit_logs (created_at);
create index idx_audit_logs_action on audit_logs (action);

comment on table audit_logs is 'Append-only audit trail. Never store passwords, API keys, tokens, or other secrets in metadata — see backend/lib/audit.';

-- =============================================================================
-- 0014_row_level_security.sql
-- =============================================================================
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

-- =============================================================================
-- 0015_storage_buckets.sql
-- =============================================================================
-- 0015_storage_buckets.sql
-- Storage foundation: product-images, brand-assets, category-assets.
-- Public read (for published/live assets), restricted write (service-role /
-- admin only). Existing static images under public/products/** are NOT
-- migrated in Phase 1 — see docs/phase-1-backend-foundation.md "Storage
-- strategy" for the future migration path.
--
-- File paths must use stable IDs, never product names, e.g.:
--   product-images/{product_id}/{variant_id-or-'default'}/{image_id}.webp
--   brand-assets/{brand_id}/{asset_id}.webp
--   category-assets/{category_id}/{asset_id}.webp

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('brand-assets', 'brand-assets', true),
  ('category-assets', 'category-assets', true)
on conflict (id) do nothing;

-- Public read for all three buckets.
create policy storage_product_images_public_read on storage.objects
  for select using (bucket_id = 'product-images');
create policy storage_brand_assets_public_read on storage.objects
  for select using (bucket_id = 'brand-assets');
create policy storage_category_assets_public_read on storage.objects
  for select using (bucket_id = 'category-assets');

-- Writes restricted to admins (authenticated users with profiles.is_admin)
-- or the service role (Edge Functions), which bypasses RLS entirely.
create policy storage_product_images_admin_write on storage.objects
  for insert with check (bucket_id = 'product-images' and is_admin());
create policy storage_product_images_admin_update on storage.objects
  for update using (bucket_id = 'product-images' and is_admin()) with check (bucket_id = 'product-images' and is_admin());
create policy storage_product_images_admin_delete on storage.objects
  for delete using (bucket_id = 'product-images' and is_admin());

create policy storage_brand_assets_admin_write on storage.objects
  for insert with check (bucket_id = 'brand-assets' and is_admin());
create policy storage_brand_assets_admin_update on storage.objects
  for update using (bucket_id = 'brand-assets' and is_admin()) with check (bucket_id = 'brand-assets' and is_admin());
create policy storage_brand_assets_admin_delete on storage.objects
  for delete using (bucket_id = 'brand-assets' and is_admin());

create policy storage_category_assets_admin_write on storage.objects
  for insert with check (bucket_id = 'category-assets' and is_admin());
create policy storage_category_assets_admin_update on storage.objects
  for update using (bucket_id = 'category-assets' and is_admin()) with check (bucket_id = 'category-assets' and is_admin());
create policy storage_category_assets_admin_delete on storage.objects
  for delete using (bucket_id = 'category-assets' and is_admin());

-- =============================================================================
-- 0016_address_default_enforcement.sql
-- =============================================================================
-- 0016_address_default_enforcement.sql
-- Phase 2 (Customer Authentication & Profiles).
--
-- customer_addresses already has partial unique indexes guaranteeing at
-- most one is_default_shipping = true / is_default_billing = true row per
-- customer (0003_customer_addresses.sql). Those indexes reject a bad state,
-- but the storefront repository layer (src/repositories/customers.repository.ts)
-- needs an atomic way to *change* the default: "unset the previous default,
-- set the new one" in one round trip, or the partial unique index would
-- reject the second row's insert/update while the first default is still
-- set.
--
-- A BEFORE trigger on the row being promoted to default handles this in the
-- same statement/transaction, and — deliberately NOT security definer — runs
-- under the same role as the outer statement, so it is still subject to the
-- customer_addresses_self_all RLS policy for the sibling rows it updates.
-- Since those sibling rows belong to the same customer (which the RLS policy
-- already allows the authenticated owner to write), this stays authorized
-- for the owning customer without needing a service-role Edge Function.

create or replace function enforce_single_default_address()
returns trigger
language plpgsql
as $$
begin
  if new.is_default_shipping then
    update customer_addresses
    set is_default_shipping = false
    where customer_id = new.customer_id
      and id <> new.id
      and is_default_shipping;
  end if;

  if new.is_default_billing then
    update customer_addresses
    set is_default_billing = false
    where customer_id = new.customer_id
      and id <> new.id
      and is_default_billing;
  end if;

  return new;
end;
$$;

create trigger trg_customer_addresses_single_default
  before insert or update of is_default_shipping, is_default_billing on customer_addresses
  for each row
  when (new.is_default_shipping or new.is_default_billing)
  execute function enforce_single_default_address();

comment on function enforce_single_default_address() is
  'Atomically clears any previous default shipping/billing address for the same customer when a new one is promoted, so the partial unique indexes in 0003_customer_addresses.sql never reject a legitimate "change my default address" update. Runs under the calling role, so it is still bound by RLS on the rows it touches.';

-- =============================================================================
-- 0017_cart_wishlist_recently_viewed.sql
-- =============================================================================
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

-- =============================================================================
-- 0018_order_address_snapshot.sql
-- =============================================================================
-- 0018_order_address_snapshot.sql
-- Phase 6 (Checkout & Order Management).
--
-- orders (0006_orders.sql) already snapshots contact info (email/phone) but
-- has no shipping address columns — checkout needs to persist an immutable
-- copy of the delivery address at the moment the order was placed, exactly
-- like order_items already snapshots product name/price ("never rely on
-- joining current data" — the same rule applies to the customer's address
-- book, which they can keep editing after the order ships).
--
-- Deliberately snapshot columns directly on `orders` (mirroring
-- order_items' snapshot philosophy) rather than a separate order_addresses
-- table — a single 1:1 shipping address per order needs no join, and this
-- keeps "read an order" a single-table read for the common case.

alter table orders add column shipping_recipient_name text;
alter table orders add column shipping_phone text;
alter table orders add column shipping_address_line_1 text;
alter table orders add column shipping_address_line_2 text;
alter table orders add column shipping_city text;
alter table orders add column shipping_province text;
alter table orders add column shipping_postal_code text;
alter table orders add column shipping_country text;
alter table orders add column delivery_method text; -- e.g. 'standard' | 'express' — free-form until Phase 11 wires real courier service levels
alter table orders add column customer_address_id uuid references customer_addresses (id) on delete set null; -- convenience back-reference only; the columns above remain the source of truth if the address is later edited/deleted

comment on column orders.shipping_address_line_1 is 'Immutable snapshot taken at checkout — never re-read from customer_addresses, which the customer may edit/delete after placing this order.';
comment on column orders.customer_address_id is 'Which saved address (if any) this snapshot came from, for admin convenience only. Nullable: guest checkout or a one-off address never touches customer_addresses at all.';

-- cart_events (0017_cart_wishlist_recently_viewed.sql) didn't anticipate a
-- cart being consumed by a real order yet — add that event type now rather
-- than overloading 'merged' (which means something different: a guest
-- cart's lines being merged into an authenticated cart) for it.
alter table cart_events drop constraint cart_events_event_type_check;
alter table cart_events add constraint cart_events_event_type_check
  check (event_type in ('created', 'item_added', 'item_updated', 'item_removed', 'cleared', 'merged', 'abandoned', 'recovered', 'converted'));

-- =============================================================================
-- 0019_accounting_local_financial_events.sql
-- =============================================================================
-- 0019_accounting_local_financial_events.sql
-- Phase 7: Local Operational Accounting Layer.
--
-- Narrow, additive extension of local_financial_transactions
-- (0011_accounting_erp_sync.sql) so it can hold every event type this
-- phase needs (sale, payment, COD collection, discount, delivery charge,
-- cancellation, return, refund), reference every domain entity an event
-- can be about (order/payment/shipment/return), record where the event
-- came from, and guarantee idempotent inserts under concurrent retries —
-- all without inventing a second ledger. ERP sync *state* itself
-- (pending/in_progress/succeeded/failed, attempts, timestamps) already
-- lives in the generic erp_sync_jobs table from Phase 1; this migration
-- does not duplicate that here, it only adds what erp_sync_jobs cannot
-- express (per-event references, source, and the idempotency key).

alter table local_financial_transactions
  add column shipment_id uuid references shipments (id) on delete set null,
  add column return_id uuid references returns (id) on delete set null,
  add column source text not null default 'system',
  add column idempotency_key text;

comment on column local_financial_transactions.shipment_id is 'Set for delivery_charge events (and optionally others) that reference a specific shipment.';
comment on column local_financial_transactions.return_id is 'Set for return/refund events that reference a specific return.';
comment on column local_financial_transactions.source is 'Where this event was recorded from, e.g. "orders.service.createOrder", "admin.manual_retry". Free text, not a foreign key — mirrors erp_sync_jobs.direction''s free-text convention.';
comment on column local_financial_transactions.idempotency_key is 'Deterministic per-event key (see backend/lib/accounting) that makes recordSaleTransaction/recordPaymentTransaction/etc. safe to call more than once for the same domain event. Enforced unique below — this is the DB-level guarantee against duplicate financial events under concurrent or retried calls.';

-- The actual duplicate-prevention mechanism: two concurrent callers racing
-- to record "the same" event (same idempotency key) can both attempt the
-- insert, but only one commits — the second gets a unique_violation (Postgres
-- error 23505), which backend/services/accounting/accounting.service.ts
-- catches and treats as "already recorded", returning the existing row
-- instead of erroring. This is strictly stronger than an application-level
-- check-then-insert (which has a race window); the constraint is enforced
-- by Postgres itself regardless of how many app instances call concurrently.
create unique index uq_local_financial_transactions_idempotency_key
  on local_financial_transactions (idempotency_key) where idempotency_key is not null;

-- transaction_type was previously validated only in the app layer (see the
-- original comment in 0011). Phase 7 defines the full explicit event-type
-- vocabulary (backend/lib/accounting's FINANCIAL_TRANSACTION_TYPES) and
-- enforces it at the database level too, so a bug in application code can't
-- silently write an unrecognized event type.
alter table local_financial_transactions
  add constraint chk_local_financial_transactions_type check (
    transaction_type in (
      'sale',
      'payment',
      'cod_collection',
      'discount',
      'delivery_charge',
      'cancellation',
      'return',
      'refund'
    )
  );

create index idx_local_financial_transactions_shipment_id on local_financial_transactions (shipment_id);
create index idx_local_financial_transactions_return_id on local_financial_transactions (return_id);
create index idx_local_financial_transactions_type on local_financial_transactions (transaction_type);

-- =============================================================================
-- 0020_accounting_adjustment_type.sql
-- =============================================================================
-- 0020_accounting_adjustment_type.sql
-- Phase 8 (LedGix ERP Integration) housekeeping: adds 'adjustment' to the
-- local_financial_transactions event-type vocabulary.
--
-- Context: Phase 10 (Easypaisa) and Phase 11 (Leopards) shipped with their
-- own self-contained inserts into local_financial_transactions instead of
-- calling Phase 7's accounting.service.ts, because both were built as
-- parallel sibling agents before Phase 7 existed (see their completion
-- reports' "Known limitations" sections). This phase consolidates both call
-- sites onto backend/services/accounting/accounting.service.ts. Easypaisa's
-- duplicate insert used the existing 'sale' type (now recordPaymentTransaction,
-- already a supported type — no schema change needed for that one).
-- Leopards' courier accounting-review flag used a 'adjustment' type that was
-- NEVER actually valid against the check constraint 0019 added (it would
-- have failed at insert time against a real database) — this migration adds
-- it properly so recordAdjustmentTransaction() (this phase's consolidated
-- replacement for backend/services/delivery/leopards/accountingReview.ts)
-- can persist it.

alter table local_financial_transactions
  drop constraint chk_local_financial_transactions_type;

alter table local_financial_transactions
  add constraint chk_local_financial_transactions_type check (
    transaction_type in (
      'sale',
      'payment',
      'cod_collection',
      'discount',
      'delivery_charge',
      'cancellation',
      'return',
      'refund',
      'adjustment'
    )
  );

comment on column local_financial_transactions.transaction_type is 'One of backend/lib/accounting''s FINANCIAL_TRANSACTION_TYPES. ''adjustment'' is a zero-amount operational flag for manual review (e.g. courier RTO/failed-delivery) — never a substitute for a real sale/refund/cancellation amount.';

-- =============================================================================
-- 0021_inventory_cache_public_read.sql
-- =============================================================================
-- 0021_inventory_cache_public_read.sql
-- Phase 9 (ERP-Controlled Inventory & Availability Synchronization).
--
-- inventory_cache (0012_inventory_cache.sql) was created admin-only —
-- correct for Phase 1, since nothing read it yet. Phase 9 needs the
-- storefront to show real availability, which means the anon-key browser
-- client needs a scoped read path. This adds exactly that: a row is
-- readable only when its variant belongs to a published product, mirroring
-- product_variants_public_read's own join shape (0014_row_level_security.sql).
--
-- This is row-level only — it does not hide any column. The public
-- storefront repository (src/repositories/products.repository.ts) is
-- responsible for field-scoping its own select (quantity_available/
-- sync_status/last_synced_at only), exactly the same convention that
-- already keeps cost_price/ledgix_item_id out of the public product
-- select. ledgix_item_id itself stays admin-only in every existing
-- product_variants policy — this migration does not touch that.

create policy inventory_cache_public_read on inventory_cache
  for select using (
    exists (
      select 1 from product_variants pv
      join products p on p.id = pv.product_id
      where pv.id = inventory_cache.variant_id
        and pv.status = 'published'
        and p.status = 'published'
    )
  );

-- =============================================================================
-- 0022_promotions_engine.sql
-- =============================================================================
-- 0022_promotions_engine.sql
-- Phase 13: Promotions, Loyalty & Customer Intelligence.
--
-- Extends the Phase 1 schema-only foundation (0010_promotions.sql:
-- campaigns/promotions/coupons/discounts) with the narrow set of columns
-- and tables the real discount/loyalty engine needs:
--   - promotions gains eligibility fields (min spend, first-order-only,
--     product/category/collection scope) so the server-side rule engine
--     (backend/lib/promotions) has something real to evaluate.
--   - coupon_redemptions is the audit trail of which customer used which
--     coupon on which order, and is also how a cancelled/refunded order's
--     coupon usage gets safely released (see the trigger below).
--   - loyalty_ledger_entries is the append-only points ledger (earn/
--     redeem/reversal) — balance is always SUM(points), never a mutable
--     column, per the phase spec.
--
-- Concurrency: the "don't let two concurrent checkouts both claim the last
-- use of a limited coupon" requirement is satisfied by
-- backend/services/promotions/promotions.service.ts's claimCouponUsage()
-- doing a single conditional UPDATE
-- (`SET times_used = times_used + 1 WHERE ... times_used < usage_limit`)
-- rather than a read-then-write — that one UPDATE statement is atomic in
-- Postgres regardless of concurrent callers, no explicit locking needed.

-- ---------------------------------------------------------------------------
-- promotions: eligibility fields
-- ---------------------------------------------------------------------------

alter table promotions
  add column min_spend bigint,
  add column first_order_only boolean not null default false,
  add column applies_to text not null default 'all',
  add column scope_id uuid;

alter table promotions
  add constraint chk_promotions_min_spend_nonnegative check (min_spend is null or min_spend >= 0);

alter table promotions
  add constraint chk_promotions_applies_to check (applies_to in ('all', 'category', 'collection', 'product'));

alter table promotions
  add constraint chk_promotions_scope_id_matches_applies_to
    check ((applies_to = 'all') = (scope_id is null));

comment on column promotions.applies_to is 'Discount scope: ''all'' applies to the whole cart subtotal; ''category''/''collection''/''product'' apply only to matching cart line items (scope_id references categories.id / collections.id / products.id respectively — no FK because it is polymorphic; validated in backend/lib/promotions instead).';
comment on column promotions.first_order_only is 'When true, only customers with zero prior orders are eligible (see backend/services/promotions/segmentation.service.ts::isFirstOrderCustomer).';

-- ---------------------------------------------------------------------------
-- coupon_redemptions: audit trail + per-customer usage counting + the
-- release marker cancellation/refund reversal uses.
-- ---------------------------------------------------------------------------

create table coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  amount bigint not null,
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chk_coupon_redemptions_amount_nonnegative check (amount >= 0),
  constraint uq_coupon_redemptions_order unique (coupon_id, order_id)
);

create index idx_coupon_redemptions_coupon_id on coupon_redemptions (coupon_id);
create index idx_coupon_redemptions_customer_id on coupon_redemptions (customer_id);
create index idx_coupon_redemptions_order_id on coupon_redemptions (order_id);

comment on column coupon_redemptions.released_at is 'Set once (by the order-status trigger below) when the owning order is cancelled/refunded and this redemption''s usage-count claim is given back — makes the release idempotent.';

-- ---------------------------------------------------------------------------
-- loyalty_ledger_entries: append-only points ledger. Balance for a customer
-- is always `SUM(points) WHERE customer_id = ...` — never a mutable column.
-- ---------------------------------------------------------------------------

create table loyalty_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  order_id uuid references orders (id) on delete set null,
  entry_type text not null,
  points bigint not null,
  description text,
  idempotency_key text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chk_loyalty_entry_type check (entry_type in ('earn', 'redeem', 'reversal'))
);

create index idx_loyalty_ledger_customer_id on loyalty_ledger_entries (customer_id);
create index idx_loyalty_ledger_order_id on loyalty_ledger_entries (order_id);

comment on table loyalty_ledger_entries is 'Append-only points event log. earn: positive points credited (order delivered). redeem: negative points spent (checkout-time redemption). reversal: an offsetting entry (opposite sign of what it undoes) for a cancelled/refunded order. idempotency_key prevents the order-status trigger (or a retried service call) from ever double-crediting/double-reversing the same event.';
comment on column loyalty_ledger_entries.points is 'Signed. earn > 0, redeem < 0, reversal is the negation of the entry it reverses. Balance = SUM(points).';

alter table coupon_redemptions enable row level security;
alter table loyalty_ledger_entries enable row level security;

create policy coupon_redemptions_admin_all on coupon_redemptions for all using (is_admin()) with check (is_admin());

create policy loyalty_ledger_self_read on loyalty_ledger_entries
  for select using (
    customer_id in (select c.id from customers c where c.profile_id = current_profile_id())
  );
create policy loyalty_ledger_admin_all on loyalty_ledger_entries for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Order-lifecycle triggers: loyalty earn on delivery, and reversal of
-- redeemed points / released coupon usage on cancellation or refund.
--
-- This is deliberately implemented as a DB trigger rather than application
-- code called from a specific service function, because order_status can be
-- transitioned from more than one call site (customer self-cancel in
-- backend/services/orders/orders.service.ts, the returns/refund flow in
-- backend/services/reviews/returns.service.ts, and eventually an admin
-- status-change endpoint from Phase 12) — a trigger guarantees the loyalty
-- consequence fires exactly once no matter which code path changes the
-- status, without Phase 13 needing to modify any of those other phases'
-- service files.
--
-- Earn rate: 1 point per 100 minor units (i.e. 1 point per Rs. 1) of
-- grand_total, floored. Documented once here and mirrored (never
-- re-derived independently) by backend/lib/loyalty's EARN_RATE_PER_MINOR_UNIT
-- constant, which the frontend/service layer uses for previews — if this
-- rate ever changes, both places must change together.
-- ---------------------------------------------------------------------------

create or replace function fn_promotions_on_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Earn: order reaches 'delivered'.
  if NEW.order_status = 'delivered' and (OLD.order_status is distinct from NEW.order_status) and NEW.customer_id is not null then
    insert into loyalty_ledger_entries (customer_id, order_id, entry_type, points, description, idempotency_key)
    values (
      NEW.customer_id,
      NEW.id,
      'earn',
      floor(NEW.grand_total / 100.0),
      'Points earned for order ' || NEW.order_number,
      'loyalty:earn:' || NEW.id
    )
    on conflict (idempotency_key) do nothing;
  end if;

  -- Reversal: order cancelled (only reachable pre-delivery, so only
  -- redeemed points and coupon usage can be outstanding — no earn to
  -- reverse) or refunded (reachable only post-delivery via the returns
  -- flow, so both earned and redeemed points may need reversing).
  if NEW.order_status in ('cancelled', 'refunded') and (OLD.order_status is distinct from NEW.order_status) then
    if NEW.order_status = 'refunded' then
      insert into loyalty_ledger_entries (customer_id, order_id, entry_type, points, description, idempotency_key)
      select l.customer_id, NEW.id, 'reversal', -l.points, 'Reversal of earned points for refunded order ' || NEW.order_number, 'loyalty:reversal:earn:' || NEW.id
      from loyalty_ledger_entries l
      where l.order_id = NEW.id and l.entry_type = 'earn'
      on conflict (idempotency_key) do nothing;
    end if;

    insert into loyalty_ledger_entries (customer_id, order_id, entry_type, points, description, idempotency_key)
    select l.customer_id, NEW.id, 'reversal', -l.points, 'Reversal of redeemed points for ' || NEW.order_status || ' order ' || NEW.order_number, 'loyalty:reversal:redeem:' || NEW.id
    from loyalty_ledger_entries l
    where l.order_id = NEW.id and l.entry_type = 'redeem'
    on conflict (idempotency_key) do nothing;

    -- Release any coupon usage claimed for this order (give the usage slot
    -- back). released_at guards against double-release on a repeated
    -- trigger fire, keeping the operation idempotent regardless.
    update coupons c
    set times_used = greatest(c.times_used - 1, 0)
    from coupon_redemptions r
    where r.order_id = NEW.id and r.coupon_id = c.id and r.released_at is null;

    update coupon_redemptions
    set released_at = timezone('utc', now())
    where order_id = NEW.id and released_at is null;
  end if;

  return NEW;
end;
$$;

create trigger trg_promotions_on_order_status_change
  after update of order_status on orders
  for each row
  execute function fn_promotions_on_order_status_change();

-- ---------------------------------------------------------------------------
-- claim_coupon_usage / release_coupon_usage: the atomic primitives
-- backend/services/promotions/promotions.service.ts calls via db.rpc(...).
-- Each is a single UPDATE ... WHERE statement, so Postgres serializes
-- concurrent callers for the same coupon row — no read-then-write gap, no
-- explicit application-level locking needed. claim_coupon_usage returns
-- false (rather than throwing) when the limit was already reached,
-- including by a request that won a race a moment earlier, so the caller
-- can turn that into a clean "coupon no longer available" error.
-- ---------------------------------------------------------------------------

create or replace function claim_coupon_usage(p_coupon_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update coupons
  set times_used = times_used + 1
  where id = p_coupon_id
    and status = 'active'
    and (usage_limit is null or times_used < usage_limit)
  returning true;
$$;

create or replace function release_coupon_usage(p_coupon_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update coupons
  set times_used = greatest(times_used - 1, 0)
  where id = p_coupon_id;
$$;

-- Deny-by-default (matching 0014_row_level_security.sql's stated policy):
-- only the service role (Edge Functions) may call these — never anon/
-- authenticated directly, since they bypass the usual RLS-scoped path.
revoke execute on function claim_coupon_usage(uuid) from public;
revoke execute on function release_coupon_usage(uuid) from public;
grant execute on function claim_coupon_usage(uuid) to service_role;
grant execute on function release_coupon_usage(uuid) to service_role;

-- =============================================================================
-- 0023_catalog_content_attributes.sql
-- =============================================================================
-- 0016_catalog_content_attributes.sql
-- Phase 3: Product Management & Dynamic Product Display Engine.
--
-- Adds a single flexible `attributes` jsonb column to `products`, mirroring
-- the convention already established on `product_variants.attributes`
-- (0005_products_variants_images.sql). This holds the small set of
-- storefront copy items the existing Aura frontend renders that don't
-- warrant their own dedicated column (marketing highlights, key benefits,
-- how-to-use steps, an explicit badge override, a product-details table,
-- and optional rating/reviewCount placeholders pending the future Reviews
-- service). The shape is validated at the application layer
-- (backend/lib/validation's productAttributesSchema), not the database —
-- consistent with how product_variants.attributes is handled.
--
-- Documented soft shape:
--   {
--     "tagline": string, "subtitle": string,
--     "badge": "new" | "sale" | "bestseller",
--     "highlights": string[], "benefits": string[], "howToUse": string[],
--     "details": [string, string][],
--     "rating": number, "reviewCount": number
--   }
--
-- Scope note: this migration touches ONLY the `products` table. It is
-- intentionally isolated from `profiles` (owned in parallel by the Phase 2
-- Customer Auth workstream) to avoid migration-ordering conflicts between
-- worktrees. Phase 3 does NOT need a profiles change — the `is_admin`
-- boolean + `is_admin()` helper this phase's admin authorization relies on
-- already shipped in 0014_row_level_security.sql.

alter table products add column attributes jsonb not null default '{}'::jsonb;

comment on column products.attributes is 'Admin-authored storefront copy not covered by a dedicated column (highlights, benefits, how-to-use, badge override, details table, rating placeholders). Validated by backend/lib/validation productAttributesSchema, not by the database.';

-- =============================================================================
-- 0024_reviews_and_returns_workflow.sql
-- =============================================================================
-- 0021_reviews_and_returns_workflow.sql
-- Phase 14: Reviews, Returns & Customer Service.
--
-- Numbering note: 0001-0020 were all taken at the time this migration was
-- written, and 0021 was verified free in this session's worktree. Phase 9
-- (ERP-Controlled Inventory), running in parallel, also landed a migration
-- as 0021_inventory_cache_public_read.sql. Both files are additive and
-- touch fully disjoint tables (this file never touches inventory_cache or
-- any products stock column), so applying them in either order is safe —
-- same resolution Phase 8 documented for the earlier 0019 collision. See
-- supabase/migrations/README.md for the full note.
--
-- Adds:
--   1. Reviews: product_reviews + product_review_images (new schema —
--      Phase 1 deferred this entirely to Phase 14, see backend/services/
--      reviews/README.md).
--   2. Returns: extends the EXISTING returns/return_items/return_events
--      tables (0009_returns.sql) with the columns this phase's workflow
--      needs, rather than duplicating them — plus a new return_item_evidence
--      table for photo evidence.
--   3. Storage buckets: review-images (public read, customer-submitted
--      evidence on a published review) and return-evidence (private —
--      never public, read only via a service-role-issued signed URL).

-- ===========================================================================
-- 1. Reviews
-- ===========================================================================

create type review_status as enum ('pending', 'published', 'rejected');

create table product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  -- The purchased line item this review is FOR — this is both "which product
  -- variant did they actually buy" and the verified-purchase proof itself.
  -- The unique constraint below is the duplicate/unverified-review-abuse
  -- guard: at most one review can ever exist per purchased line item,
  -- enforced at the database level (not just app-layer discipline), same
  -- pattern as 0019's shipment/idempotency-key uniqueness.
  order_item_id uuid not null references order_items (id) on delete cascade,
  rating smallint not null,
  title text,
  body text,
  status review_status not null default 'pending',
  moderation_note text,
  moderated_by uuid references profiles (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chk_product_reviews_rating_range check (rating between 1 and 5),
  constraint uq_product_reviews_order_item unique (order_item_id)
);

create trigger trg_product_reviews_updated_at
  before update on product_reviews
  for each row execute function set_updated_at();

create index idx_product_reviews_product_id on product_reviews (product_id);
create index idx_product_reviews_customer_id on product_reviews (customer_id);
create index idx_product_reviews_status on product_reviews (status);

comment on table product_reviews is 'Verified-purchase product reviews. order_item_id both identifies what was actually bought and doubles as the one-review-per-purchase proof/duplicate guard. See backend/services/reviews/reviews.service.ts for the eligibility check this alone does not fully express (delivered order state).';
comment on column product_reviews.order_item_id is 'The specific purchased line item being reviewed. UNIQUE — enforces "at most one review per purchased item," the core anti-abuse guarantee this table provides at the database level.';

create table product_review_images (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references product_reviews (id) on delete cascade,
  storage_path text not null,          -- path within the `review-images` storage bucket
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_product_review_images_review_id on product_review_images (review_id);

-- ===========================================================================
-- 2. Returns — extend 0009_returns.sql's schema, don't duplicate
-- ===========================================================================

alter table returns
  add column if not exists resolution text,
  add column if not exists inspection_outcome text,
  add column if not exists inspection_notes text,
  add column if not exists refund_method text,
  add column if not exists refund_payment_id uuid references payments (id) on delete set null,
  add column if not exists ledgix_credit_note_id text,
  add column if not exists ledgix_credit_note_number text;

alter table returns
  add constraint chk_returns_resolution check (resolution is null or resolution in ('refund', 'replacement'));
alter table returns
  add constraint chk_returns_refund_method check (refund_method is null or refund_method in ('easypaisa', 'manual'));

comment on column returns.resolution is 'Post-inspection decision: refund or replacement. Null until the return reaches "received" and an admin records the inspection outcome (backend/services/reviews/returns.service.ts''s recordInspectionOutcome).';
comment on column returns.inspection_outcome is 'Free-text summary of what the received item looked like on inspection (e.g. "confirmed damaged as described", "item does not match description, rejecting"). Paired with resolution.';
comment on column returns.refund_method is 'How refund_amount was (or will be) returned to the customer: easypaisa (via the real EasypaisaProvider.refundPayment once configured) or manual (COD/bank transfer handled outside the app). Set only when resolution = refund. See backend/services/reviews/refund.service.ts.';
comment on column returns.refund_payment_id is 'The original order payment this refund was issued against, when one exists (COD orders may have no payments row to refund against — see refund.service.ts).';
comment on column returns.ledgix_credit_note_id is 'LedGix ERP credit note reference for this return''s refund/replacement reversal, stamped only after a real ErpProvider.recordCreditNote() call actually succeeds — never fabricated. Mirrors local_financial_transactions.ledgix_document_id''s "only ever written on genuine success" rule from Phase 8.';

alter table return_items
  add column if not exists reason_code text;

alter table return_items
  add constraint chk_return_items_reason_code check (
    reason_code is null or reason_code in (
      'damaged_in_transit', 'wrong_item_received', 'not_as_described',
      'defective_quality', 'changed_mind', 'size_fit_issue', 'other'
    )
  );

comment on column return_items.reason_code is 'Structured reason code driving the return-policy eligibility engine (backend/lib/returns) and whether photo evidence is required. return_items.reason (pre-existing, free text) remains the customer''s own notes.';

create table return_item_evidence (
  id uuid primary key default gen_random_uuid(),
  return_item_id uuid not null references return_items (id) on delete cascade,
  storage_path text not null,          -- path within the private `return-evidence` storage bucket
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_return_item_evidence_return_item_id on return_item_evidence (return_item_id);

comment on table return_item_evidence is 'Customer-submitted photo evidence for a return line item — required for some reason codes (see backend/lib/returns'' REASON_CODES_REQUIRING_EVIDENCE). Stored in the PRIVATE return-evidence bucket; read access is only ever via a service-role-issued short-lived signed URL, never a public bucket read.';

-- ===========================================================================
-- 3. Storage buckets
-- ===========================================================================
-- File paths use stable IDs only, same convention as 0015_storage_buckets.sql:
--   review-images/{review_id}/{image_id}.{ext}
--   return-evidence/{return_item_id}/{evidence_id}.{ext}

insert into storage.buckets (id, name, public)
values
  ('review-images', 'review-images', true),
  ('return-evidence', 'return-evidence', false)
on conflict (id) do nothing;

create policy storage_review_images_public_read on storage.objects
  for select using (bucket_id = 'review-images');
-- Writes go through a service-role-issued signed upload URL (see
-- backend/services/reviews/reviews.service.ts's createReviewImageUploadUrl,
-- same shape as Phase 3's createProductImageUploadUrl) — the policies below
-- are defense-in-depth for the admin/service-role path, not the actual
-- upload mechanism (a valid signed-upload token authorizes independently of
-- these policies).
create policy storage_review_images_admin_write on storage.objects
  for insert with check (bucket_id = 'review-images' and is_admin());
create policy storage_review_images_admin_delete on storage.objects
  for delete using (bucket_id = 'review-images' and is_admin());

-- return-evidence is PRIVATE: deliberately no public-read policy, and no
-- authenticated-role policy either. Every read/write goes through the
-- returns Edge Function's service-role client with an explicit
-- ownership/admin check, same trust model as shipments' request_payload/
-- provider_payload never being exposed through a public bucket.
create policy storage_return_evidence_admin_all on storage.objects
  for all using (bucket_id = 'return-evidence' and is_admin())
  with check (bucket_id = 'return-evidence' and is_admin());

-- ===========================================================================
-- 4. Row Level Security
-- ===========================================================================

alter table product_reviews enable row level security;
alter table product_review_images enable row level security;
alter table return_item_evidence enable row level security;

-- Public storefront read of published reviews — the whole point of this
-- table's existence. No insert/update policy for authenticated customers:
-- writes require the eligibility check (verified delivered purchase, one
-- review per order item) that only the reviews Edge Function's service-role
-- client performs — same "self-read only, service-role writes" model Phase 1
-- already established for `returns` itself.
create policy product_reviews_public_read on product_reviews
  for select using (status = 'published');

create policy product_reviews_self_read on product_reviews
  for select using (customer_id in (select c.id from customers c where c.profile_id = current_profile_id()));

create policy product_reviews_admin_all on product_reviews
  for all using (is_admin()) with check (is_admin());

create policy product_review_images_public_read on product_review_images
  for select using (
    exists (select 1 from product_reviews r where r.id = product_review_images.review_id and r.status = 'published')
  );

create policy product_review_images_self_read on product_review_images
  for select using (
    exists (
      select 1 from product_reviews r
      join customers c on c.id = r.customer_id
      where r.id = product_review_images.review_id and c.profile_id = current_profile_id()
    )
  );

create policy product_review_images_admin_all on product_review_images
  for all using (is_admin()) with check (is_admin());

-- return_item_evidence ROW metadata (not the storage bytes themselves,
-- which stay behind the private bucket + signed URL above) is self-readable
-- by the owning customer, matching returns_self_read's existing shape.
create policy return_item_evidence_self_read on return_item_evidence
  for select using (
    exists (
      select 1 from return_items ri
      join returns rt on rt.id = ri.return_id
      join customers c on c.id = rt.customer_id
      where ri.id = return_item_evidence.return_item_id and c.profile_id = current_profile_id()
    )
  );

create policy return_item_evidence_admin_all on return_item_evidence
  for all using (is_admin()) with check (is_admin());

-- =============================================================================
-- 0025_leopards_shipments.sql
-- =============================================================================
-- 0019_leopards_shipments.sql
-- Phase 11: Leopards Courier Fulfilment & Returns — operational columns on
-- the Phase 1 `shipments` model, and enum values for the courier-status
-- normalization layer (backend/services/delivery/leopards/statusNormalization.ts).
--
-- No live Leopards calls are added by this migration — it only extends the
-- LOCAL operational record so a shipments row can exist (and be tracked
-- through booking attempts) even while every real courier call still
-- throws IntegrationNotConfiguredError. See backend/lib/providers/leopards/
-- LeopardsCourierProvider.ts.

-- 'pending_booking': a shipments row created locally for a packed/ready
--   order BEFORE any courier booking call has succeeded (today: before it
--   has even been attempted against a real API, since none exists). Distinct
--   from the pre-existing 'pending' value, which is reserved for "Leopards
--   has acknowledged the booking and it's awaiting pickup" once a real
--   integration exists — so a future successful booking response can move a
--   shipment 'pending_booking' -> 'pending' without conflating "we tried to
--   book" with "the courier accepted the booking".
alter type shipment_status add value if not exists 'pending_booking';

-- Finer-grained RTO states than the original single 'returned' value, matching
-- the generic courier-state vocabulary the spec calls out explicitly
-- ("rto_initiated", "rto_delivered"). 'returned' is kept (not removed —
-- Postgres enums don't support safely dropping a value) as a legacy/generic
-- terminal alias; new code should prefer the granular states below.
alter type shipment_status add value if not exists 'rto_initiated';
alter type shipment_status add value if not exists 'rto_in_transit';
alter type shipment_status add value if not exists 'rto_delivered';

-- Distinguishes an outbound (Aura -> customer) shipment from a customer
-- RETURN pickup shipment (Aura books a Leopards pickup FROM the customer).
-- Both are physically "a Leopards shipment" and share the same tracking/
-- status-event machinery, so they stay one table rather than forking a
-- parallel `return_shipments` table.
alter table shipments
  add column if not exists purpose text not null default 'outbound',
  add column if not exists return_id uuid references returns (id) on delete set null,
  add column if not exists request_payload jsonb,
  add column if not exists booking_error text,
  add column if not exists booking_attempted_at timestamptz,
  add column if not exists idempotency_key text;

alter table shipments
  add constraint chk_shipments_purpose check (purpose in ('outbound', 'return'));

alter table shipments
  add constraint chk_shipments_return_requires_return_id
    check (purpose <> 'return' or return_id is not null);

create index if not exists idx_shipments_return_id on shipments (return_id);
create index if not exists idx_shipments_purpose on shipments (purpose);

-- Duplicate-booking prevention: at most one non-cancelled OUTBOUND shipment
-- per order. A cancelled shipment frees the order up for a fresh booking
-- attempt (e.g. after a courier-side cancellation), so the partial index
-- excludes 'cancelled' rather than being a plain unique(order_id).
create unique index if not exists uq_shipments_order_outbound_active
  on shipments (order_id)
  where purpose = 'outbound' and status <> 'cancelled';

-- A caller-supplied idempotency key (mirrors backend/lib/idempotency's
-- pattern) additionally protects a single booking *attempt* from being
-- double-submitted (e.g. a retried Edge Function invocation), independent
-- of the order-level uniqueness above.
create unique index if not exists uq_shipments_idempotency_key
  on shipments (idempotency_key)
  where idempotency_key is not null;

comment on column shipments.purpose is 'outbound (Aura -> customer) or return (Leopards pickup from customer for an approved return). See 0009_returns.sql for the returns workflow this hands off to (Phase 14).';
comment on column shipments.request_payload is 'Sanitized (no secrets) snapshot of the booking request we WOULD send to Leopards — populated even while createShipment() throws IntegrationNotConfiguredError, so the operational record shows exactly what was attempted.';
comment on column shipments.booking_error is 'Last booking/pickup/tracking attempt error message (e.g. "Leopards Courier integration is not configured."), surfaced to admin reconciliation views instead of a crash.';

-- =============================================================================
-- seed.sql (dev sample data)
-- =============================================================================
-- supabase/seed.sql
-- DEV-ONLY seed data. NOT applied by `supabase db push` — only by
-- `supabase db reset` / `supabase start` in local development, per Supabase
-- CLI convention. Safe to re-run (idempotent upserts via ON CONFLICT).
-- Contains no real production data, no real customers, no real orders.

insert into brands (id, name, slug, status, sort_order)
values
  ('00000000-0000-0000-0000-000000000001', 'SADOER', 'sadoer', 'published', 1),
  ('00000000-0000-0000-0000-000000000002', 'Hero Cosmetics', 'hero-cosmetics', 'published', 2),
  ('00000000-0000-0000-0000-000000000003', 'SOME BY MI', 'some-by-mi', 'published', 3)
on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = excluded.status;

insert into categories (id, name, slug, status, sort_order)
values
  ('00000000-0000-0000-0000-000000000101', 'Masks', 'masks', 'published', 1),
  ('00000000-0000-0000-0000-000000000102', 'Acne Care', 'acne-care', 'published', 2),
  ('00000000-0000-0000-0000-000000000103', 'Toners', 'toners', 'published', 3)
on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = excluded.status;

insert into products (id, brand_id, name, slug, short_description, status, is_featured, published_at)
values
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000001',
    'SADOER Collagen Anti-Aging Facial Mask',
    'sadoer-collagen-anti-aging-facial-mask',
    '25g collagen firming sheet mask',
    'published', true, timezone('utc', now())
  )
on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = excluded.status;

insert into product_variants (id, product_id, sku, title, price, compare_at_price, status)
values
  (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    'ABC-SADOER-SD80885',
    '25g',
    12900,   -- Rs. 129.00 in minor units (paisa)
    19900,   -- Rs. 199.00 in minor units (paisa)
    'published'
  )
on conflict (id) do update set price = excluded.price, compare_at_price = excluded.compare_at_price;

insert into product_categories (product_id, category_id)
values ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101')
on conflict do nothing;

