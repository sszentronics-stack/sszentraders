# accounting

**Phase:** 7

Local fallback accounting: sales, payments, COD receivables, delivery charges, discounts, cancellations, refunds, returns — each record carries local transaction ID, ERP sync status, ERP reference ID, sync timestamps, error/retry history. Not the authoritative financial system; LedGix ERP (Phase 8) is.

Status: **implemented.** See `docs/phase-7-completion-report.md` for the full writeup.

## Phase 1 foundation
- Schema: `supabase/migrations/0011_accounting_erp_sync.sql` (`local_financial_transactions`, `erp_sync_jobs`, `erp_sync_events`).
- Deployable code home: `supabase/functions/accounting/index.ts` (was `NotImplementedYetError` — now a minimal admin diagnostics/retry router).

## Phase 7 implementation
- Schema addition: `supabase/migrations/0019_accounting_local_financial_events.sql` (`shipment_id`/`return_id` references, `source`, `idempotency_key` + unique index, `transaction_type` check constraint).
- Pure domain logic: `backend/lib/accounting` (event-type vocabulary, debit/credit semantics documentation for Phase 8, deterministic idempotency-key builder, unsynced-state helper).
- Service: `backend/services/accounting/accounting.service.ts` — `recordSaleTransaction`, `recordPaymentTransaction`, `recordCodCollectionTransaction`, `recordDiscountTransaction`, `recordDeliveryChargeTransaction`, `recordCancellationTransaction`, `recordReturnTransaction`, `recordRefundTransaction`, `listUnsyncedFinancialEvents`, `retryFinancialEventSync`.
- Wired into `backend/services/orders/orders.service.ts`: `createOrder()` calls `recordSaleTransaction` (+ `recordDiscountTransaction`/`recordDeliveryChargeTransaction` when non-zero) immediately after the order/items/payment inserts; `requestOrderCancellation()` calls `recordCancellationTransaction`.
- Edge Function: `supabase/functions/accounting/index.ts` — admin-only `GET /unsynced` and `POST /:id/retry`.
- Never calls LedGix — `backend/lib/providers/ledgix/LedGixErpProvider` is not imported here at all; every event is scheduled as a `pending` `erp_sync_jobs` row for Phase 8 to actually sync.

## Phase 8 additions
- `recordAdjustmentTransaction` — consolidated call site for courier RTO/failed-delivery review flags (`backend/services/delivery/leopards/tracking.service.ts`), replacing that phase's original self-contained insert. Added the `'adjustment'` transaction type (`supabase/migrations/0020_accounting_adjustment_type.sql`).
- `recordPaymentTransaction` (pre-existing, previously uncalled) is now wired into `backend/services/payments/easypaisa/easypaisa.service.ts`'s verified-`paid`-callback path, replacing that phase's original self-contained insert.
- `getFinancialTransactionById`, `markErpSyncInProgress`, `markErpSyncSucceeded`, `markErpSyncFailed`, `markErpSyncSkipped` — new ERP-sync-state primitives consumed by `backend/services/erp/ledgix/sync.service.ts`'s real sync worker. This file remains the single owner of every write to `local_financial_transactions`, including the `ledgix_document_id`/`ledgix_document_number` stamp-back once a real sync succeeds.
- See `docs/phase-8-completion-report.md` for the full Phase 10/11 consolidation writeup and the LedGix sync architecture built on top of this service.
