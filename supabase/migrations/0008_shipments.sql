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
