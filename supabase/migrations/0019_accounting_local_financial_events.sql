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
