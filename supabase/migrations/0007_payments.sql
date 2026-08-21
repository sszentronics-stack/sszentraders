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
