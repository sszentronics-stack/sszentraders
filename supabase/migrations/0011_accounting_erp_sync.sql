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
