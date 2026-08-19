# Phase 8 Completion Report — LedGix ERP Integration

## Implementation summary

Phase 8 connects Aura's local commerce/accounting events (Phase 7's `local_financial_transactions` queue) to LedGix ERP — the eventual authoritative accounting/reporting system — by completing the full surrounding architecture: customer resolve-or-create mapping, a real sync worker that maps each local financial event to an ERP document action (invoice/receipt/credit note) and attempts the sync, ERP-sync-state primitives that stamp real ERP references back onto local records only on genuine success, a health/configuration-status query, reconciliation-check logic, and a best-guess webhook-verification framework. **No real LedGix ERP API documentation or credentials exist in this project**, so every method on `LedGixErpProvider` that would call the real LedGix API still throws `IntegrationNotConfiguredError` — nothing here fabricates a successful sync, an invoice number, or a specific LedGix endpoint/field name.

As part of this phase, per the explicit housekeeping instruction, **Phase 10 (Easypaisa) and Phase 11 (Leopards)'s duplicated self-contained `local_financial_transactions` inserts were consolidated to call Phase 7's `backend/services/accounting/accounting.service.ts`** instead — see the dedicated section below.

Delivered:
- **`ErpProvider` extended** (`backend/lib/providers/ErpProvider.ts`) with `recordCreditNote`/`ErpCreditNoteRef`/`RecordCreditNoteInput`, covering cancellation reversals, return credits, and refund documents as a single "credit note" ERP document concept. `LedGixErpProvider` implements it the same way every other method is implemented: throws `IntegrationNotConfiguredError`.
- **`backend/lib/erp/`** (pure, zero-I/O, mirroring `backend/lib/accounting`'s split from its service layer): `mapFinancialEventToErpAction` (sale→invoice, payment/cod_collection→receipt, cancellation/return/refund→credit_note, discount/delivery_charge/adjustment→skip), `classifyErpSyncError`/`isRetryableErpSyncError`, `decideCustomerSync`, and `reconcileLocalWithErp` (real duplicate-reference/local-succeeded-ERP-missing/amount-mismatch detection against constructed fixtures). `webhook.ts` — generic best-guess HMAC-SHA256 LedGix webhook signature verification, matching Phase 10/11's established pattern exactly.
- **`backend/services/erp/ledgix/`** (DB orchestration): `customer.service.ts` (`resolveOrCreateErpCustomer` — check-existing-mapping-first, create-only-if-absent), `sync.service.ts` (`attemptErpSync` — the real per-event sync worker; `runErpSyncBatch` — a batch driver over Phase 7's `listUnsyncedFinancialEvents()`, ready for a future scheduler but not invoked automatically), `health.service.ts` (`getErpHealthStatus` — `{ configured, pendingSyncCount }`, never leaks credentials), `reconciliation.service.ts` (`runErpReconciliation` — DB wrapper feeding the pure comparison logic).
- **`accounting.service.ts` extended** with the ERP-sync-state primitives Phase 8's worker needs: `getFinancialTransactionById`, `markErpSyncInProgress`, `markErpSyncSucceeded` (the *only* place that ever stamps `ledgix_document_id`/`ledgix_document_number`, and only after a real provider call actually returned one), `markErpSyncFailed`, `markErpSyncSkipped`. Also adds `recordAdjustmentTransaction` (a zero-amount "flag for manual review" event type) and the `'adjustment'` transaction type, both needed by the Phase 11 consolidation.
- **Admin endpoints** on `supabase/functions/accounting/index.ts` (extended, not duplicated): `POST /:id/sync` (attempt a real sync now — resolves to `failed` with a clear not-configured message today), `GET /erp/health`, `GET /erp/reconciliation` — alongside Phase 7's pre-existing `GET /unsynced`/`POST /:id/retry`. All admin-JWT-gated (`requireAdmin`) and audited.
- **`supabase/functions/integrations-ledgix/index.ts` extended**: a `/webhook` route (fails closed on a missing/unverified signature, matching Leopards' exact shape) and a `recordCreditNote` passthrough operation alongside the existing raw-provider operations.
- **Phase 10/11 consolidation** (separate commit): deleted `backend/services/payments/easypaisa/localFinancialEvent.ts` and `backend/services/delivery/leopards/accountingReview.ts`; their one call site each now calls `recordPaymentTransaction`/`recordAdjustmentTransaction` on Phase 7's `accounting.service.ts`.

## Architecture and key decisions

- **`backend/lib/erp` vs `backend/services/erp/ledgix` mirrors Phase 7's `backend/lib/accounting` vs `backend/services/accounting` split exactly** — pure, unit-testable decision logic in `lib`, DB/provider orchestration in `services`. `mapFinancialEventToErpAction`'s type/action table is the single place that decides "sale becomes an invoice, a payment becomes a receipt, a cancellation becomes a credit note" — the sync worker (`sync.service.ts`) never re-derives this mapping inline.
- **`discount`/`delivery_charge`/`adjustment` are `skip`, not synced as standalone ERP documents.** Discount and delivery charge are already netted into the sale's invoice line items (per Phase 7's `FINANCIAL_TRANSACTION_SEMANTICS`) — syncing them separately would double-count. `adjustment` (the new courier-review-flag type) is local-only by design; LedGix has no document type for "please look at this manually." The sync worker marks these jobs `skipped` (a real terminal state, not a silent no-op) with an explanatory `last_error` note.
- **A `credit_note` document unifies cancellation/return/refund**, rather than three separate ERP concepts, because all three are "money owed back or a sale reversed against an (optionally existing) invoice" from LedGix's likely perspective — and per the "do not invent specific LedGix field names" rule, a generic `RecordCreditNoteInput` with a free-text `reason` field is the least presumptuous shape until real docs exist.
- **Customer/order/payment ERP-reference writes are split across three tables by design, matching Phase 1's schema**: `customers.ledgix_customer_id` (customer mapping — `customer.service.ts`), `orders.ledgix_invoice_id`/`number` (invoice — `sync.service.ts`'s sale path), `payments.ledgix_receipt_id`/`number` (receipt — `sync.service.ts`'s payment path). `local_financial_transactions.ledgix_document_id`/`number` is stamped for *every* successful sync regardless of type — the generic "what ERP document resulted from this local event" pointer the Phase 7 table comment already promised. `accounting.service.ts` remains the single owner of every write to `local_financial_transactions` (including this stamp), matching Phase 7's original design — `sync.service.ts` calls into it rather than writing that table directly.
- **`markErpSyncSucceeded()` is the one and only code path that writes an ERP document reference anywhere in this codebase**, and it is called from exactly three places in `sync.service.ts`, each immediately after a real (today: not-configured, so never reached) `ErpProvider` call returned a value. This directly enforces the phase's most important rule: never fabricate an ERP number. Verified by test (`sync.service.test.ts`'s not-configured tests assert `ledgix_document_id`/`ledgix_invoice_id` stay unset after a failed attempt).
- **A payment/COD receipt cannot sync before its order has a LedGix invoice.** `syncPaymentToReceipt()` throws (classified `permanent`, not `not_configured`) if `orders.ledgix_invoice_id` is still null — a receipt against a nonexistent invoice is a real business-logic error LedGix would presumably reject anyway, and this codebase would rather fail loudly with a clear local message than guess an invoice reference. Covered by test.
- **Guest-checkout orders (`orders.customer_id is null`) cannot sync a sale today** — `syncSaleToInvoice()` throws a clear `ServerError` rather than guessing a placeholder LedGix customer. Guest-order ERP mapping was judged out of scope for this pass (not called out in the spec) and is flagged under "Known limitations."
- **Error classification (`classifyErpSyncError`) is a real seam, not a fully-realized taxonomy** — the only error this codebase can actually produce today is `IntegrationNotConfiguredError` (always `not_configured`). `transient` (network-layer `TypeError`) and `permanent` (everything else) exist so a future real-HTTP-aware classifier has somewhere to plug in without changing any caller; `isRetryableErpSyncError` already treats `not_configured` as retryable (an admin fixing env vars later should be able to just retry, not need special-case UI).
- **Reconciliation compares against an injectable ERP snapshot that defaults to `[]`**, because `ErpProvider` has no "list ERP documents" capability and none is invented here. Run today, `runErpReconciliation()` correctly reports every locally-`succeeded` record (there are none) as `local_succeeded_erp_missing` — an honest reflection of "nothing has ever actually synced." The comparison *logic* (duplicate references, amount mismatches) is real and exercised via `backend/lib/erp/erp.test.ts`'s fixtures, ready for a real snapshot the moment one exists.
- **Sanitized error storage**: `sync.service.ts` only ever persists `err.message` for `IntegrationNotConfiguredError`/`ServerError` (both static, developer-authored, non-secret strings) into `erp_sync_jobs.last_error`; any other unrecognized error is replaced with a generic fallback message, mirroring `backend/lib/errors`'s `toAppError()` "never leak an unrecognized error's detail" rule. No raw provider payload is ever stored.
- **Every sync attempt (succeeded/failed/skipped) writes exactly one audit log entry** (`erp.sync_attempted`) via `backend/lib/audit`, and every admin-triggered route (`POST /:id/sync`, plus the pre-existing `POST /:id/retry`) requires `requireAdmin`.
- **Webhook verification is a documented best-guess**, matching Phase 10 (`backend/lib/payments/easypaisa/signature.ts`) and Phase 11 (`backend/services/delivery/leopards/webhook.ts`) exactly: HMAC-SHA256 over the raw body, hex-encoded, optional `sha256=` prefix, compared in constant time, fails closed (`LedGixWebhookSecretNotConfiguredError`) when no secret is configured. Whether LedGix even sends webhooks is unconfirmed — `supabase/functions/integrations-ledgix/index.ts`'s `/webhook` route verifies and acknowledges but does not act on anything yet, since no confirmed payload shape or Aura-side consumer exists (that's plausibly Phase 9's territory once inbound inventory events matter).

## Database-schema changes

One new migration: `supabase/migrations/0020_accounting_adjustment_type.sql`.
- Every column Phase 8 needed already existed from Phase 1: `customers.ledgix_customer_id`, `orders.ledgix_invoice_id`/`ledgix_invoice_number`, `payments.ledgix_receipt_id`/`ledgix_receipt_number`, `local_financial_transactions.ledgix_document_id`/`ledgix_document_number`. No new migration was needed for the ERP integration itself.
- `0020` is **housekeeping for the Phase 10/11 consolidation**, not Phase 8 feature work: it adds `'adjustment'` to `local_financial_transactions`' `chk_local_financial_transactions_type` check constraint. This was actually necessary — Phase 11's original `accountingReview.ts` inserted `transaction_type: 'adjustment'` directly, a value the Phase 7 check constraint (added in `0019_accounting_local_financial_events.sql`) never actually permitted; that insert would have failed against any real database with both migrations applied. `0020` fixes this as part of routing it through the (now type-safe) `recordAdjustmentTransaction()`.
- **Pre-existing migration-numbering note** (not introduced by this phase, flagged for the record): `0019_accounting_local_financial_events.sql` (Phase 7) and `0019_leopards_shipments.sql` (Phase 11) share the same numeric prefix, both merged as parallel sibling agents. Both are additive and touch disjoint tables/columns, so applying them in either order is safe — documented in `supabase/migrations/README.md`.

## UI/UX changes

None. Per the spec, ERP health/configuration status and the sync/reconciliation admin endpoints are service-layer/Edge-Function only — Phase 12 builds UI. No frontend file was touched.

## Security and permissions

- `LEDGIX_API_BASE_URL`/`LEDGIX_API_KEY`/`LEDGIX_COMPANY_ID` (pre-existing, still blank) and the new `LEDGIX_WEBHOOK_SECRET` are read exclusively through `supabase/functions/_shared/config.ts`, server-side only, never present in the Vite build.
- `getErpHealthStatus()` takes an already-loaded config object and returns only booleans/counts — verified by test that its JSON output never contains the config's credential values.
- Every new admin route (`POST /:id/sync`, `GET /erp/health`, `GET /erp/reconciliation`) requires `requireAdmin()` (JWT-verify + `profiles.is_admin`), same pattern as every other privileged Edge Function route in this codebase.
- The `/webhook` route on `integrations-ledgix` authenticates the *sender* via HMAC signature, not a caller JWT (it's a server-to-server callback) — fails closed (`501`) on a missing secret, `401` on an invalid/missing signature, before any database access happens.
- `sync.service.ts`'s failed-sync error messages are sanitized (see "Architecture" above) before being persisted to `erp_sync_jobs.last_error` or returned in an API response — no raw provider payload or stack trace is ever stored or displayed.
- Every sync attempt and retry writes an audit log entry via `backend/lib/audit`'s `writeAuditLog()`, which already refuses metadata keys that look like secrets.

## External integration impact

**No live LedGix integration exists or was invented.** Every method on `LedGixErpProvider` (including the new `recordCreditNote`) still throws `IntegrationNotConfiguredError`, whether or not `LEDGIX_API_BASE_URL`/`LEDGIX_API_KEY`/`LEDGIX_COMPANY_ID` are set. No endpoint path, request/response field name, or webhook contract is confirmed against real LedGix documentation — the webhook scheme, credit-note shape, and line-item mapping are all documented best-guess skeletons. Existing order/payment/shipment/accounting flows from Phases 1-7/10/11 were verified unbroken (see Tests below) — no call site outside this phase's own new/consolidated files was touched.

## Tests and build results

Run from the repo root (worktree):
```
npm run typecheck   # tsc --noEmit -p tsconfig.json — 0 errors
npm run lint         # oxlint — 4 pre-existing warnings in src/context/*.jsx (unrelated to this phase, unchanged from every prior phase's report), 0 errors
npm run test         # vitest run — 261 passed (261), 34 test files (was 242/30 before this phase)
npm run build         # vite build — succeeds, dist/ produced (pre-existing >500kB single-chunk warning, unrelated)
```

New test files:
- `backend/lib/erp/erp.test.ts` — `mapFinancialEventToErpAction` for every transaction type, `classifyErpSyncError`/`isRetryableErpSyncError`, `decideCustomerSync`'s use-existing-vs-create branches, and `reconcileLocalWithErp`'s full discrepancy-detection surface (missing-in-ERP, no-document-id-but-succeeded, amount mismatch, duplicate reference, and the "pending/failed rows are not issues" negative case) against constructed fixtures.
- `backend/lib/erp/webhook.test.ts` — valid signature (with/without `sha256=` prefix), tampered body, wrong secret, missing header, and the fail-closed no-secret-configured throw — mirrors Easypaisa/Leopards' own webhook test shape.
- `backend/services/erp/ledgix/customer.service.test.ts` — reuses-existing-mapping-without-calling-create, creates-and-persists-on-first-sync, propagates `IntegrationNotConfiguredError` via the real `LedGixErpProvider(null)` without fabricating a mapping, and `NotFoundError` for an unknown customer.
- `backend/services/erp/ledgix/sync.service.test.ts` — the real `LedGixErpProvider(null)` proves a sale event fails safely with a clear message and never stamps an invoice id/ledgix_document_id (today's actual, permanent state); discount events are skipped without ever calling the provider; a fake succeeding provider exercises the full future-state success path for invoice/receipt/credit-note sync including the customer-mapping resolve and the "receipt needs an existing invoice first" business rule; `runErpSyncBatch` end-to-end over multiple unsynced events.
- `backend/services/erp/ledgix/health.service.test.ts` — configured true/false for full/partial/missing config, and that the health status JSON never contains the raw API key.
- `backend/services/erp/ledgix/reconciliation.service.test.ts` — snapshot-building (job-status join, defaulting to `pending` when no job row exists) and the full `runErpReconciliation` flow against an empty vs. a matching ERP snapshot.
- `backend/lib/providers/providers.test.ts` extended — `LedGixErpProvider` now also asserts `createInvoice`/`recordReceipt`/`recordCreditNote` all reject with `IntegrationNotConfiguredError`, both unconfigured and "configured" (config presence ≠ working integration).
- `backend/services/accounting/accounting.service.test.ts` extended — `recordPaymentTransaction`/`recordAdjustmentTransaction` (the two Phase 10/11 consolidation call sites) and all four new ERP-sync-state primitives (`markErpSyncInProgress`/`Succeeded`/`Failed`/`Skipped`), including that `markErpSyncFailed` never touches `ledgix_document_id`.

**Not tested against a live database or a live LedGix endpoint** (none exists in this environment — same documented limitation as every prior phase): the Edge Function routers themselves (`supabase/functions/accounting/index.ts`'s new routes, `supabase/functions/integrations-ledgix/index.ts`'s webhook route) are not covered by automated tests, consistent with this repo's existing convention (Deno-only files, excluded from `tsconfig.json`/Vitest). The service-layer logic those routers call into is fully unit tested with in-memory fakes.

## Files created/modified/deleted

**Created (Phase 8 feature work):**
- `backend/lib/erp/index.ts`, `backend/lib/erp/erp.test.ts`
- `backend/lib/erp/webhook.ts`, `backend/lib/erp/webhook.test.ts`
- `backend/services/erp/ledgix/customer.service.ts` (+ `.test.ts`)
- `backend/services/erp/ledgix/sync.service.ts` (+ `.test.ts`)
- `backend/services/erp/ledgix/health.service.ts` (+ `.test.ts`)
- `backend/services/erp/ledgix/reconciliation.service.ts` (+ `.test.ts`)
- `backend/services/erp/ledgix/testUtils.ts`
- `docs/phase-8-completion-report.md` (this file)

**Created (Phase 10/11 consolidation housekeeping):**
- `supabase/migrations/0020_accounting_adjustment_type.sql`

**Modified (Phase 8 feature work):**
- `backend/lib/providers/ErpProvider.ts` — added `ErpCreditNoteRef`/`RecordCreditNoteInput`/`recordCreditNote`.
- `backend/lib/providers/ledgix/LedGixErpProvider.ts` — implemented `recordCreditNote` (not-configured), refreshed doc comments.
- `backend/lib/providers/providers.test.ts` — extended LedGix coverage.
- `supabase/functions/accounting/index.ts` — added `POST /:id/sync`, `GET /erp/health`, `GET /erp/reconciliation`.
- `supabase/functions/integrations-ledgix/index.ts` — added `/webhook` route and `recordCreditNote` passthrough.
- `supabase/functions/_shared/config.ts` — added `getLedGixWebhookSecret()`.
- `.env.example` — added `LEDGIX_WEBHOOK_SECRET=`.
- `backend/services/erp/ledgix/README.md`, `backend/lib/README.md`, `supabase/migrations/README.md` — updated for Phase 8.

**Modified (Phase 10/11 consolidation):**
- `backend/services/accounting/accounting.service.ts` — added `recordAdjustmentTransaction`, `getFinancialTransactionById`, `markErpSyncInProgress`/`Succeeded`/`Failed`/`Skipped`.
- `backend/lib/accounting/index.ts` — added the `'adjustment'` transaction type + its semantics entry.
- `backend/services/accounting/accounting.service.test.ts` — extended with tests for the above.
- `backend/services/payments/easypaisa/easypaisa.service.ts` — replaced the `recordLocalFinancialEvent` call with `recordPaymentTransaction` (Phase 7's accounting service).
- `backend/services/delivery/leopards/tracking.service.ts` — replaced the `recordCourierAccountingReview` call with `recordAdjustmentTransaction` (Phase 7's accounting service).
- `backend/services/payments/easypaisa/README.md`, `backend/services/delivery/leopards/README.md`, `backend/services/accounting/README.md` — updated to reflect the consolidation.

**Deleted (Phase 10/11 consolidation):**
- `backend/services/payments/easypaisa/localFinancialEvent.ts` — the Phase 10 temporary self-contained writer.
- `backend/services/delivery/leopards/accountingReview.ts` — the Phase 11 temporary self-contained writer.

## Migrations/configuration required

- Apply `supabase/migrations/0020_accounting_adjustment_type.sql` (after `0019`, either ordering of the two `0019` files) once a live Supabase project exists.
- Deploy the updated `accounting` and `integrations-ledgix` Edge Functions (`supabase functions deploy accounting`, `supabase functions deploy integrations-ledgix`) — no redeploy needed for `payments`/`shipments` (their routers weren't touched; only the service files they import from changed).
- Real, still-blank env vars (server-side Edge Function secrets only, per `.env.example`):
  - `LEDGIX_API_BASE_URL`
  - `LEDGIX_API_KEY`
  - `LEDGIX_COMPANY_ID`
  - `LEDGIX_WEBHOOK_SECRET` (new in this phase)

## Known limitations/deferred items

- **No real LedGix API contract was available.** Every field name (`RecordCreditNoteInput`'s `reason`, the webhook's assumed `X-LedGix-Signature` header, whatever payload shape the webhook eventually needs to act on), the exact invoice/receipt/credit-note endpoints, and whether LedGix even sends webhooks at all are documented best-guess skeletons pending real LedGix integration docs/credentials. Only `LedGixErpProvider`'s method bodies (and `backend/lib/erp/webhook.ts`'s scheme) need to change once real docs exist — the surrounding architecture (sync-state machine, customer mapping, reconciliation, admin endpoints) should not.
- **Guest-checkout orders cannot sync a sale to LedGix today** — `syncSaleToInvoice()` requires `orders.customer_id` to be non-null (so a customer mapping can be resolved) and throws a clear, permanent-classified error otherwise. Deciding how (or whether) to map a guest order to a LedGix customer was judged out of this phase's scope.
- **Reconciliation runs against an empty ERP snapshot** until a real "list ERP documents" capability exists (not part of `ErpProvider` — no confirmed LedGix API for it). The comparison logic itself is real and fully tested; only the live data feed is missing.
- **No automated scheduling exists** for `runErpSyncBatch()` — same documented pattern as Phase 7's `retryFinancialEventSync`. `supabase/functions/accounting/index.ts`'s module doc documents the two serverless-compatible options (Supabase `pg_cron`/`pg_net`, or an external cron hitting an Edge Function) without configuring either; `POST /:id/sync` is today's on-demand equivalent.
- **The LedGix webhook route verifies and acknowledges but does not act on anything** — no confirmed payload shape exists, and no current Aura domain flow needs an inbound LedGix event (Phase 9's ERP-controlled inventory is the most likely eventual consumer).
- **`item_id` mapping (`product_variants.ledgix_item_id`) is read but never written** by this phase — an order line item whose variant has no LedGix item mapping yet is silently excluded from `createInvoice`'s line items rather than blocking the whole sale sync. Populating `ledgix_item_id` for real products is Phase 9's territory.
- **No live-database or live-LedGix integration test** — same documented limitation as every prior phase (no live Supabase project or live LedGix sandbox in this environment). All decision/mapping/sync-state logic is unit tested against constructed fixtures and in-memory fakes.
- **Phase 10/11 consolidation is now complete** — both `localFinancialEvent.ts` and `accountingReview.ts` are deleted; `easypaisa.service.ts` and `tracking.service.ts` call Phase 7's `accounting.service.ts` directly. No further consolidation work remains for those two phases.

## Next-phase readiness

Phase 8 delivers the complete surrounding architecture for LedGix ERP sync — customer resolve-or-create mapping, a real per-event sync worker with correct invoice/receipt/credit-note routing, ERP-sync-state primitives that only ever stamp a real document reference on genuine success, a health-status query, tested reconciliation-comparison logic, and a best-guess webhook framework — while every actual LedGix API call remains a clean, typed, never-fake-success `IntegrationNotConfiguredError`, exactly as the project's rule for this situation requires. The Phase 10/11 consolidation is done: there is now exactly one code path (`accounting.service.ts`) that writes `local_financial_transactions`. Phase 9 (ERP-controlled inventory) can build directly on this phase's customer/item mapping patterns (`customers.ledgix_customer_id` via `resolveOrCreateErpCustomer`'s pattern, `product_variants.ledgix_item_id` as read by `buildInvoiceLineItems`) and `ErpProvider.getInventorySnapshot()`, which Phase 8 left untouched and still throws not-configured, ready for Phase 9 to implement its own inventory-sync worker against the exact same "attempt sync, not-configured throws, record stays pending, never fabricate a number" pattern this phase establishes. Tests/lint/typecheck/build are all green and no existing order/payment/shipment/accounting flow from Phases 1-7/10/11 was broken.
