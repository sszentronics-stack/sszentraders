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
