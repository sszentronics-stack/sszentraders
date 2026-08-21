# erp/ledgix

**Phase:** 8 (this pass); 9 and 15 build further on top of it (ERP-controlled inventory, and any later reporting work)

LedGix ERP integration: customer resolve-or-create mapping, financial-event → ERP document sync (invoice/receipt/credit note), health/configuration status, and local-vs-ERP reconciliation. Every real LedGix API call still throws `IntegrationNotConfiguredError` — no real LedGix API documentation or credentials exist in this project.

Status: **architecture implemented, real API calls not configured** (see `docs/phase-8-completion-report.md`).

## Files
- `customer.service.ts` — `resolveOrCreateErpCustomer()`: checks `customers.ledgix_customer_id` first; only calls `provider.upsertCustomer()` (throws not-configured today) when no mapping exists yet. Never duplicates a customer in LedGix.
- `sync.service.ts` — `attemptErpSync()`: the real sync worker. Maps a `local_financial_transactions` row to an ERP document action (invoice/receipt/credit_note/skip — see `backend/lib/erp`'s `mapFinancialEventToErpAction`), resolves the customer when needed, calls the injected `ErpProvider`, and always leaves the transaction's `erp_sync_jobs` row in a terminal state for the attempt (succeeded/failed/skipped) plus exactly one audit log entry. `runErpSyncBatch()` drives this over every row from Phase 7's `listUnsyncedFinancialEvents()` — not invoked automatically anywhere (no scheduler is configured; see `supabase/functions/accounting/index.ts`'s module doc).
- `health.service.ts` — `getErpHealthStatus()`: `{ configured, pendingSyncCount }`, service-layer only (no UI — Phase 12's job), never echoes credential values.
- `reconciliation.service.ts` — `runErpReconciliation()`: DB-orchestration wrapper around `backend/lib/erp`'s pure `reconcileLocalWithErp()`. Detects local-succeeded/ERP-missing records, duplicate ERP references, and amount mismatches. The ERP-side snapshot defaults to `[]` since `ErpProvider` has no "list documents" capability yet — the comparison logic itself is real and fully tested against constructed fixtures.
- `testUtils.ts` — an in-memory fake Supabase query builder used only by this directory's `*.test.ts` files (adds count-only/head query support the sibling Leopards fake doesn't need).

## Pure logic (backend/lib/erp/)
- `index.ts` — `mapFinancialEventToErpAction`, `classifyErpSyncError`/`isRetryableErpSyncError`, `decideCustomerSync`, and `reconcileLocalWithErp`. Zero I/O, fully unit tested.
- `webhook.ts` — best-guess generic HMAC-SHA256 LedGix webhook signature verification, matching the exact pattern Phase 10 (Easypaisa)/Phase 11 (Leopards) already established for their own webhooks. It is not confirmed LedGix sends webhooks at all.

## Wiring
- Provider interface: `backend/lib/providers/ErpProvider.ts` (Phase 8 added `recordCreditNote`/`ErpCreditNoteRef`/`RecordCreditNoteInput` for cancellation/return/refund events).
- Provider skeleton: `backend/lib/providers/ledgix/LedGixErpProvider.ts` — every method throws `IntegrationNotConfiguredError`, never a fabricated success.
- Admin sync/health/reconciliation endpoints: `supabase/functions/accounting/index.ts` (`POST /:id/sync`, `GET /erp/health`, `GET /erp/reconciliation`), extending Phase 7's `GET /unsynced`/`POST /:id/retry`.
- Thin provider passthrough + inbound webhook receiver: `supabase/functions/integrations-ledgix/index.ts`.
- Schema: no new migration needed — `customers.ledgix_customer_id`, `orders.ledgix_invoice_id`/`ledgix_invoice_number`, `payments.ledgix_receipt_id`/`ledgix_receipt_number`, and `local_financial_transactions.ledgix_document_id`/`ledgix_document_number` all already existed from Phase 1. `supabase/migrations/0020_accounting_adjustment_type.sql` is a Phase 10/11-consolidation housekeeping migration, not Phase 8 feature schema.

## What's still missing
Real LedGix API documentation/credentials. Every endpoint, request/response field name, and the webhook scheme are documented best-guesses — see `docs/phase-8-completion-report.md`'s "Known limitations" section. Phase 9 (ERP-controlled inventory) is expected to build on this phase's customer/item mapping patterns (`ledgix_customer_id`/`ledgix_item_id`) and `ErpProvider.getInventorySnapshot()`.
