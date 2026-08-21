# Phase 7 Completion Report — Local Operational Accounting Layer

## Implementation summary

Phase 7 builds the local-first financial-event recording layer that sits between commerce actions (order creation, cancellation, and — for future phases — payments, returns, refunds) and LedGix ERP synchronization. Every commerce financial event is now persisted to `local_financial_transactions` as soon as it happens, independent of whether/when ERP sync succeeds. No second ledger, invoice numbering, or general-ledger/chart-of-accounts logic was built — this is deliberately a durable "Aura believes this happened, and it needs to reach the ERP eventually" queue, not a competing accounting system. LedGix ERP (Phase 8) remains the authoritative source of truth; Phase 7 never calls it (the `LedGixErpProvider` skeleton from Phase 1 is not imported anywhere in this phase's code).

Delivered:
- **Full local financial event vocabulary** (`backend/lib/accounting`): `sale`, `payment`, `cod_collection`, `discount`, `delivery_charge`, `cancellation`, `return`, `refund` — matching the spec's required event types, enforced both in TypeScript and via a new database check constraint.
- **`backend/services/accounting/accounting.service.ts`** — the write path: `recordSaleTransaction`, `recordPaymentTransaction`, `recordCodCollectionTransaction`, `recordDiscountTransaction`, `recordDeliveryChargeTransaction`, `recordCancellationTransaction`, `recordReturnTransaction`, `recordRefundTransaction`, plus `listUnsyncedFinancialEvents` (diagnostics) and `retryFinancialEventSync` (admin/Phase-8 retry primitive).
- **Wired into Phase 6's order flow, additively**: `orders.service.ts`'s `createOrder()` now calls `recordSaleTransaction` (always) and `recordDiscountTransaction`/`recordDeliveryChargeTransaction` (when non-zero) right after the existing order/order_items/payments inserts; `requestOrderCancellation()` calls `recordCancellationTransaction`. No existing order-creation/cancellation logic was restructured — these are net-new sequential calls appended to the existing write chain, in the same style as the pre-existing `order_status_history`/`payments` inserts.
- **Every financial event is idempotent per underlying domain entity+event-type**, via a deterministic key (`accounting:<type>:<entityId>[:<suffix>]`) and a new database-level unique constraint — see "Database-schema changes" and "Tests" below.
- **ERP sync scheduling, not execution**: each recorded event gets a matching `pending` row in the already-existing `erp_sync_jobs` table (Phase 1). Phase 7 never transitions a job past `pending`; Phase 8's real sync worker will.
- **Minimal admin diagnostics/retry surface**: `supabase/functions/accounting/index.ts` now implements `GET /unsynced` and `POST /:id/retry` (both admin-JWT-gated via the existing `requireAdmin` helper), replacing the Phase 1 `NotImplementedYetError` stub. No admin UI — that's Phase 12.

## Architecture and key decisions

- **ERP sync *state* reuses `erp_sync_jobs` rather than adding new status columns to `local_financial_transactions`.** The Phase 1 schema already has a generic, reusable job-tracking table (`entity_type`/`entity_id`/`status`/`attempts`/`last_error`/timestamps) designed for exactly this. Duplicating that shape as columns on `local_financial_transactions` would fork the same concept twice. The spec's "retrying" state is expressed as `status = 'pending'` with `attempts > 0` (via `retryFinancialEventSync`) rather than a new enum value, since `erp_sync_status` (`pending | in_progress | succeeded | failed | skipped`) has no dedicated "retrying" member and adding one wasn't necessary to express the behavior.
- **Idempotency is a deterministic key per domain event, not a client-supplied HTTP idempotency key.** Phase 1's `backend/lib/idempotency` (`decideIdempotency`/`hashRequestPayload`) is designed around a client-generated key attached to one HTTP request (as Phase 6 already uses it for `POST /orders`). Financial-event recording, however, is called internally by service code (not directly by an HTTP client), potentially several times for the same underlying entity (a retried `createOrder()` call after a downstream failure, a future webhook redelivery once Easypaisa/Leopards exist). `backend/lib/accounting`'s `buildFinancialEventIdempotencyKey(type, entityId, suffix?)` builds a stable key from data the service already has (e.g. `accounting:sale:<orderId>`), and a **new database unique index** on `local_financial_transactions.idempotency_key` is the actual enforcement mechanism — not an application-level check-then-insert (which has a race window under concurrent calls). `accounting.service.ts`'s `recordFinancialEvent()` catches the resulting Postgres `23505` unique-violation and transparently returns the already-existing row, so every `recordXTransaction()` function is safe to call more than once for the same event without any caller-side "did this already happen?" check.
- **No literal cross-table DB transaction — same compensating-write pattern the rest of the codebase already uses.** Supabase's JS client talks to Postgres over PostgREST (one statement per call); `orders.service.ts`'s `createOrder()` already does a sequential, non-transactional `orders` → `order_items` → `order_status_history` → `payments` write chain and simply propagates any error (no manual rollback of earlier inserts). Phase 7's accounting calls slot into that exact same chain, in the exact same style: `recordSaleTransaction`/`recordDiscountTransaction`/`recordDeliveryChargeTransaction` are awaited in-line, and if any throws, `createOrder()` throws too — the Edge Function's existing idempotency layer (`decideIdempotency`, Phase 6) already marks the whole operation `failed` and safe to retry in that case. Because the accounting idempotency key is derived from the order id (not the HTTP idempotency key), a retried `createOrder()` call — whether it re-runs the order insert too, or (via Phase 6's replay path) never reaches this code a second time — can never produce two `sale` events for the same order. This is the documented compensating-write approach the spec asks for when a literal transaction boundary isn't available.
- **The ERP sync-job insert is best-effort and does not roll back the financial event.** If the `erp_sync_jobs` insert fails right after a successful `local_financial_transactions` insert, the financial event — the more important of the two records — is still safely committed. `listUnsyncedFinancialEvents()` surfaces a transaction with no matching sync job as needing attention (its `syncJob` is `null`), and `retryFinancialEventSync()` creates the missing job when it doesn't find one, so this failure mode is self-healing via the same retry primitive Phase 8 will drive automatically.
- **Debit/credit semantics are documented, not implemented.** `backend/lib/accounting`'s `FINANCIAL_TRANSACTION_SEMANTICS` is a plain lookup table of one-sentence descriptions per event type, purely informational context for Phase 8's future ERP mapping — no local chart-of-accounts, no ledger balancing logic exists or is computed against it.
- **`recordPaymentTransaction`/`recordCodCollectionTransaction`/`recordReturnTransaction`/`recordRefundTransaction` are exposed but not yet called from any commerce flow**, because the domain events that would trigger them (a real Easypaisa payment settling, a courier COD remittance, a processed return) don't exist as implemented flows yet (Phases 10/11/14). They are ready for those phases (and for Phase 8's reconciliation code) to call once those flows exist, per the "invoked by commerce domain events... rather than from UI components" requirement — the functions exist at the correct layer now so those future phases add a call site, not new accounting plumbing.

## Database-schema changes

One new migration: `supabase/migrations/0019_accounting_local_financial_events.sql` (next free number after `0018`; verified no `0019` existed before this — Phase 10/11 siblings were told to avoid this range).

- `local_financial_transactions` gains:
  - `shipment_id uuid references shipments(id) on delete set null` — for `delivery_charge` events tied to a specific shipment.
  - `return_id uuid references returns(id) on delete set null` — for `return`/`refund` events tied to a specific return.
  - `source text not null default 'system'` — free-text provenance (e.g. `'orders.service.createOrder'`), mirroring `erp_sync_jobs.direction`'s existing free-text convention.
  - `idempotency_key text` with a new **unique partial index** (`where idempotency_key is not null`) — the DB-level duplicate-prevention guarantee the spec asks to document.
  - A new **check constraint** restricting `transaction_type` to the eight event types this phase defines (previously validated only in the app layer per the original 0011 comment).
  - New indexes on `shipment_id`, `return_id`, and `transaction_type`.
- No changes to `erp_sync_jobs`/`erp_sync_events`/`payments`/`shipments`/`returns` — Phase 1's schema for those was already sufficient.
- No RLS changes needed: `local_financial_transactions`/`erp_sync_jobs`/`erp_sync_events` already have admin-only-all policies from `0014_row_level_security.sql`; this phase's Edge Function additions use the service-role client with its own `requireAdmin` check, same pattern as every other privileged function.

## UI/UX changes

None. Per the spec, Phase 7 has no admin UI (Phase 12's job) and no customer-facing surface — every existing page/flow is visually and behaviorally unchanged.

## Security and permissions

- `backend/services/accounting/accounting.service.ts` never accepts a client-suppliable amount — every `recordXTransaction()` function takes already-computed, already-persisted domain values (an order's `grandTotal`, a payment's `amount`, etc.), matching the rest of the codebase's "never trust the client for money" rule.
- No ERP secrets or provider payloads are persisted anywhere in this phase — `LedGixErpProvider`/its config type are not imported by any file this phase touches.
- `supabase/functions/accounting/index.ts`'s both routes require `requireAdmin(req)` (JWT-verify + `profiles.is_admin` check) — no anon-key path exists for reading unsynced events or triggering a retry.
- `retryFinancialEventSync()` writes an audit log entry (`accounting.sync_retry_requested`, via `backend/lib/audit`'s `writeAuditLog`, which already refuses metadata keys that look like secrets) for every manual retry, satisfying "audit manual retry/reconciliation actions."
- No new environment variables or secrets were introduced.

## External integration impact

None. `backend/lib/providers/ledgix/LedGixErpProvider` is untouched and still throws `IntegrationNotConfiguredError` for every method — Phase 7 does not call it. `backend/lib/providers/easypaisa/`, `backend/lib/providers/leopards/`, `supabase/functions/integrations-easypaisa/`, `supabase/functions/integrations-leopards/`, `supabase/functions/payments/`, and `supabase/functions/shipments/` were not touched, per the sibling-agent concurrency notice.

## Tests and build results

Run from the repo root (worktree):
```
npm run typecheck   # tsc --noEmit — 0 errors
npm run lint         # oxlint — 4 pre-existing warnings (unrelated to this phase, same as Phase 6's report), 0 errors
npm run test         # vitest run — 155 passed (155), 21 test files (was 146/20 before this phase)
npm run build         # vite build — succeeds, dist/ produced
```

New test files:
- `backend/lib/accounting/accounting.test.ts` — event-type vocabulary completeness, idempotency-key determinism/uniqueness-by-type/uniqueness-by-entity, unsynced-state classification.
- `backend/services/accounting/accounting.service.test.ts` — against a purpose-built in-memory fake of the exact Supabase client chains this service uses (not a generic mock): verifies `recordSaleTransaction` inserts both the financial-transaction row and its `pending` sync job; verifies calling it twice for the same order returns the same row rather than creating a duplicate (modeling the same 23505-conflict path the real unique index produces); verifies a `sale` and a `cancellation` event on the same order do not collide; a `Promise.all` "concurrent calls" test confirming two simultaneous calls for the same order never produce two rows; `listUnsyncedFinancialEvents` correctly excludes an event whose job is `succeeded`; `retryFinancialEventSync` requeues an existing job to `pending`, increments `attempts`, and writes exactly one audit log entry.

**Not tested against a live database**: the real Postgres unique-constraint behavior under genuine concurrent connections (the fake client's "concurrent" test is sequential, as documented in its own comment) and the Edge Function router itself — no live Supabase project exists in this environment, consistent with every prior phase's documented limitation.

## Files created/modified/deleted

**Created:**
- `supabase/migrations/0019_accounting_local_financial_events.sql`
- `backend/lib/accounting/index.ts`, `backend/lib/accounting/accounting.test.ts`
- `backend/services/accounting/accounting.service.ts`, `backend/services/accounting/accounting.service.test.ts`
- `docs/phase-7-completion-report.md` (this file)

**Modified:**
- `backend/services/orders/orders.service.ts` — added `recordSaleTransaction`/`recordDiscountTransaction`/`recordDeliveryChargeTransaction` calls in `createOrder()`, and `recordCancellationTransaction` in `requestOrderCancellation()`. No other logic changed.
- `supabase/functions/accounting/index.ts` — replaced the `NotImplementedYetError` stub with the `GET /unsynced` / `POST /:id/retry` router.
- `backend/services/accounting/README.md` — status updated from "not started" to "implemented" with a Phase 7 section.

**Deleted:** none.

## Migrations/configuration required

- Run `supabase/migrations/0019_accounting_local_financial_events.sql` against the target Supabase project (after `0018_order_address_snapshot.sql`).
- Deploy the updated `accounting` Edge Function (`supabase functions deploy accounting`) — no changes needed to `orders`, since `orders.service.ts`'s new calls are picked up automatically when that function is next deployed.
- No new environment variables.

## Known limitations/deferred items

- **ERP sync itself is Phase 8's job.** Every event this phase records stays `pending` in `erp_sync_jobs` forever until Phase 8's real sync worker (using `LedGixErpProvider`, once configured) processes it. This is intentional — the spec explicitly scopes Phase 7 to preparing local records, not syncing them.
- **No automated scheduling exists yet** for draining `erp_sync_jobs` — `retryFinancialEventSync` and `listUnsyncedFinancialEvents` are on-demand primitives only. The module doc in `supabase/functions/accounting/index.ts` documents the two serverless-compatible scheduling options for Phase 8 (Supabase `pg_cron`/`pg_net`, or an external cron hitting the Edge Function) without configuring either, per instruction.
- **`recordPaymentTransaction`, `recordCodCollectionTransaction`, `recordReturnTransaction`, and `recordRefundTransaction` have no call site yet** — the commerce flows that would trigger them (live Easypaisa settlement, COD courier remittance, processed returns) belong to Phases 10/11/14 respectively. They are fully implemented, idempotent, and tested in isolation, ready for those phases to wire in.
- **No live-database integration test** for the real Postgres unique-constraint race behavior — same documented limitation as every prior phase (no live Supabase project in this environment).
- **`local_financial_transactions` is explicitly not a general ledger** — no chart of accounts, no double-entry balancing, no locally-generated invoice/receipt numbers. `ledgix_document_id`/`ledgix_document_number` remain `null` until Phase 8 actually syncs and stamps them back.

## Next-phase readiness

Phase 7 delivers a complete local-first financial-event queue: every order's sale (plus discount/delivery-charge when applicable) and every cancellation now durably lands in `local_financial_transactions` with a `pending` `erp_sync_jobs` row, before any ERP call is even attempted — and repeated/retried calls for the same event are guaranteed not to duplicate it, enforced at the database level. Phase 8 (LedGix ERP Integration) has exactly what it needs to start: `listUnsyncedFinancialEvents()` to find work, `retryFinancialEventSync()`'s requeue mechanics to build its retry loop on top of, and a stable set of `recordXTransaction()` call sites Phases 10/11/14 can wire in as their own commerce events go live. Tests/lint/typecheck/build are all green and no existing order/checkout/cancellation behavior was altered — only additive, sequential calls were appended to the existing write chains.
