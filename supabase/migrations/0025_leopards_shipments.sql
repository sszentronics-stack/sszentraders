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
