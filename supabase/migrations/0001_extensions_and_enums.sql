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
