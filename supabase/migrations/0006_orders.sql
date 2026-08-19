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
