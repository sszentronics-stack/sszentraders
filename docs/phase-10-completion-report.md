# Phase 10 Completion Report — Easypaisa Online Payments

## Implementation summary

Phase 10 builds the full server-side architecture for Easypaisa online payments — payment-intent records, initiation flow, a webhook callback handler with a signature-verification framework, an idempotent status state machine, refund initiation, and an admin reconciliation query — while keeping every actual call to the real Easypaisa API throwing `IntegrationNotConfiguredError`, exactly as Phase 1 established and the project's own rule requires. **No real Easypaisa API documentation or credentials exist in this project**, so nothing here invents a specific request/response shape for the live gateway; it only completes the surrounding, provider-agnostic machinery so a future pass with real docs/credentials can wire `EasypaisaProvider`'s three methods to actual HTTP calls without touching anything else.

COD is untouched and remains the fully functional payment path — `orders.service.ts` (Phase 6) was not modified.

## Architecture and key decisions

- **`EasypaisaProvider` (`backend/lib/providers/easypaisa/EasypaisaProvider.ts`) was left unchanged.** It already matched the spec precisely: every method throws `IntegrationNotConfiguredError`, even when "configured" (config presence alone must never imply a working integration). Rewriting it would have meant inventing real Easypaisa field names/endpoints, which is explicitly forbidden without their docs.
- **New pure logic lives in `backend/lib/payments/easypaisa/`, not `backend/services/payments/easypaisa/`.** This repo has an existing convention — pure, unit-testable logic under `backend/lib` (with colocated `*.test.ts`), DB-orchestration under `backend/services` left untested against a live database (e.g. `backend/lib/orders` has tests, `backend/services/orders/orders.service.ts` does not). `vite.config.js`'s vitest `include` only scans `backend/lib/**/*.test.ts` and `src/**/*.test.ts` — confirming this is the established pattern, not just a preference. Two modules moved there:
  - `signature.ts` — a generic HMAC-SHA256 constant-time webhook signature verifier. Explicitly documented as a **best-guess pattern**, not a confirmed Easypaisa contract (see "External integration impact" below).
  - `callbackStateMachine.ts` — pure decision logic (`decidePaymentCallback`) for what a verified callback should do to a payment: apply a transition, acknowledge a duplicate, ignore a stale/out-of-order late callback, or reject on amount/transaction-id mismatch. Zero I/O, fully unit tested.
- **DB orchestration lives in `backend/services/payments/easypaisa/`:**
  - `easypaisa.service.ts` — `initiateEasypaisaPayment`, `handleEasypaisaCallback`, `refundEasypaisaPayment`, `getPaymentReconciliationDetail`. Takes an injected `PaymentProvider` instance rather than reading env itself, so it stays Deno-agnostic and testable with a fake provider if needed later.
  - `localFinancialEvent.ts` — see the dedicated section below.
- **Payment-intent-before-provider-call is enforced by reusing Phase 6's existing behavior, not duplicating it.** `orders.service.ts`'s `createOrder()` already inserts a `payments` row in `pending` status the moment checkout selects Easypaisa (Phase 6, unmodified). `initiateEasypaisaPayment()` looks up that existing row rather than creating a second one for the same attempt; it only creates a fresh attempt row when the most recent one already reached `failed`/`cancelled` (the "retry payment against an existing order" path), so a retry doesn't corrupt the history of the earlier failed attempt.
- **The webhook path never trusts a client-asserted "I paid" signal.** `supabase/functions/payments/index.ts`'s `/easypaisa/callback` route takes no caller JWT — it authenticates the *sender*, not a browser session, purely via `verifyWebhookSignature()` against the raw request body. A failed or missing signature returns `401 AuthenticationError` before any database write happens, and is audited as `payment.easypaisa.callback_rejected`. There is no code path anywhere that lets a redirect query parameter, a POST from the frontend, or any authenticated-customer call mark a payment `paid`.
- **Idempotency is keyed on `(providerTransactionId, outcome)`**, checked against `payment_events` before applying a transition (`handleEasypaisaCallback` queries for an existing `webhook_received` event with a matching `raw_payload` before calling the pure state machine). Every callback still gets a `payment_events` row appended (append-only audit trail), but the state machine's `alreadyRecorded` flag prevents re-applying a transition or re-recording a duplicate financial event.
- **Terminal-state protection.** Once a payment reaches `paid`/`failed`/`cancelled`/`refunded`/`partially_refunded`, a later out-of-order callback (e.g. a delayed `pending` retry arriving after the real `paid` event) is ignored rather than downgrading the payment — see `callbackStateMachine.test.ts`'s "ignores a late/out-of-order callback" case.
- **Amount/transaction-id mismatch is checked before idempotency**, so a mismatched amount is rejected even if the caller mistakenly flags it as already-recorded (`callbackStateMachine.test.ts`'s "amount mismatch is checked before ... masked by a duplicate flag" case) — a defense-in-depth ordering choice, not something the real Easypaisa contract will dictate.
- **Reconciliation is allowlisted, not redacted-by-blacklist.** `getPaymentReconciliationDetail()` never returns `payment_events.raw_payload` verbatim to a caller — it maps only four known-safe fields (`providerTransactionId`, `outcome`, `amountReported`, `decision`) out of the raw JSON. This is deliberately an allowlist rather than reusing `backend/lib/logger`'s secret-key-pattern blacklist, because a real (currently unknown) Easypaisa payload could contain sensitive fields under names the blacklist doesn't anticipate.

## Local financial event — temporary duplication (read before Phase 7 merges)

Per the concurrency notice, Phase 7 (Local Operational Accounting) may not be merged yet and this phase must not import from `backend/services/accounting/`. `backend/services/payments/easypaisa/localFinancialEvent.ts` is a small, self-contained helper that inserts directly into `local_financial_transactions` (schema already exists — `supabase/migrations/0011_accounting_erp_sync.sql`, Phase 1) on a verified `paid` transition. Its file header explicitly flags this as temporary duplication: **once both Phase 7 and Phase 10 are merged, a follow-up pass should delete this file and have `easypaisa.service.ts` call Phase 7's `accounting.service.ts` instead**, so there is only one code path writing `local_financial_transactions` rows.

## Database schema changes

**None.** Phase 1's `payments`/`payment_events` schema (`0007_payments.sql`) and `local_financial_transactions` (`0011_accounting_erp_sync.sql`) were already sufficient for this phase's architecture — idempotency is achieved by querying `payment_events` for an existing matching event rather than needing a new unique constraint. No new migration file was added.

## UI/UX changes

**None.** Per the phase spec, UI is Phase 12's job. `src/pages/Checkout.jsx` already (from Phase 6) presents Easypaisa as "coming soon — your order will be recorded as pending payment)" and never calls any payment-initiation endpoint — verified unchanged and still accurate: an Easypaisa order is created with a `pending` payment row and nothing in the current frontend calls `/payments/easypaisa/initiate`, so no UI change was required to keep the "never fake success" guarantee true today. The new endpoints exist and are ready for Phase 12 to wire a real "Pay with Easypaisa" button and callback-return page against.

## Security and permissions

- `/easypaisa/initiate` requires a valid caller JWT (`requireCallerProfile`) and reuses `orders.service.ts`'s `getOrderForCaller()` — the same ownership check Phase 6 already uses, including its "never distinguish not-yours from doesn't-exist" behavior.
- `/easypaisa/refund` and `/easypaisa/reconciliation/:id` require `requireAdmin` (`profiles.is_admin`), the same pattern as other admin-only Edge Functions.
- `/easypaisa/callback` requires no JWT (it's a server-to-server webhook) but requires a valid HMAC-SHA256 signature over the raw body, verified in constant time (`callbackStateMachine`'s sibling `signature.ts`). A missing `EASYPAISA_WEBHOOK_SECRET` (not configured) and an invalid signature are treated identically: reject with 401, never process, never acknowledge as if valid.
- Merchant credentials (`EASYPAISA_MERCHANT_ID`, `EASYPAISA_STORE_ID`, `EASYPAISA_HASH_KEY`, `EASYPAISA_API_BASE_URL`, `EASYPAISA_WEBHOOK_SECRET`) are read only via `supabase/functions/_shared/config.ts`'s `getEasypaisaConfig()` (Phase 1, unchanged) — never touched by frontend code, never logged (verified against `backend/lib/logger`'s `SECRET_KEY_PATTERN`, which would redact any of these key names if they were ever accidentally passed to `logger.*`).
- Every sensitive action is audited via `backend/lib/audit`'s `writeAuditLog`: `payment.easypaisa.initiate_attempted`, `payment.easypaisa.callback_rejected`, `payment.easypaisa.callback_processed`, `payment.easypaisa.refund_attempted`. Audit metadata is deliberately minimal (order/payment id, status, decision) — never a raw payload.
- **Rate limiting**: no custom in-function limiter was built. This Edge Function relies on Supabase's project-level Edge Function rate limits and Hostinger/CDN edge protection, documented inline in `supabase/functions/payments/index.ts`. A correct distributed limiter needs shared state (e.g. Redis) this project doesn't have; the webhook path's mandatory signature check is the primary defense against abuse in the meantime.

## External integration impact

**No live Easypaisa integration exists or was invented.** Every method on `EasypaisaProvider` still throws `IntegrationNotConfiguredError`. The webhook signature scheme (`backend/lib/payments/easypaisa/signature.ts`) is an explicit **best-guess**: HMAC-SHA256 hex digest of the raw JSON body, compared in constant time, expected in a header named `X-Easypaisa-Signature`. This is the overwhelmingly common pattern for payment-gateway webhooks, but it is **not confirmed against Easypaisa's actual contract** — the header name, digest encoding, and whether the digest covers the raw body vs. a canonicalized field concatenation are all unverified assumptions, flagged in the file's own header comment. Similarly, the callback payload field names (`orderId`/`orderReference`, `providerTransactionId`/`transactionId`, `status`, `amount`) in `EasypaisaCallbackPayload` are generic placeholders pending real docs.

LedGix ERP sync (Phase 8) is explicitly left as a `TODO` comment at the point `easypaisa.service.ts`'s `handleEasypaisaCallback()` records a `paid` transition — no ERP call is made or invented.

## Tests and build results

Run from the repo root:
```
npm run typecheck   # tsc --noEmit — 0 errors
npm run lint         # oxlint — 4 pre-existing/expected warnings (unchanged from Phase 6), 0 errors
npm run test         # vitest run — 163 passed (163), 22 test files (was 146/20 before this phase)
npm run build         # vite build — succeeds, dist/ produced
```
New test files:
- `backend/lib/payments/easypaisa/signature.test.ts` (7 tests) — correct signature accepted, case-insensitive hex, tampered body rejected, wrong secret rejected, missing signature rejected, empty secret rejected, raw constant-time-compare behavior.
- `backend/lib/payments/easypaisa/callbackStateMachine.test.ts` (9 tests) — forward transitions (pending→paid/processing/failed/cancelled), duplicate-callback acknowledgement, stale/out-of-order late-callback protection, amount-mismatch rejection, transaction-id-mismatch rejection, and mismatch-wins-over-duplicate-flag ordering.
- `backend/lib/providers/providers.test.ts` extended (2 more assertions) — `EasypaisaProvider.verifyPayment`/`refundPayment` also throw `IntegrationNotConfiguredError` when unconfigured (previously only `initiatePayment` was asserted), and a "configured" instance still throws (config presence ≠ working integration).

**Not tested against a live database or a live Easypaisa endpoint** (none exists in this environment — same documented limitation as every prior phase): `easypaisa.service.ts`'s DB orchestration (`initiateEasypaisaPayment`, `handleEasypaisaCallback`, `refundEasypaisaPayment`, `getPaymentReconciliationDetail`) and the `supabase/functions/payments/index.ts` router are not covered by automated tests, consistent with this repo's existing convention that DB-orchestration service files (e.g. `orders.service.ts`) are exercised manually/live rather than with a fake Supabase client. The state-machine and signature logic that actually encodes the required behaviors (duplicate/out-of-order handling, amount mismatch rejection, signature verification) IS fully unit tested, since that's where the actual decision logic lives.

## Files created/modified/deleted

**Created:**
- `backend/lib/payments/easypaisa/signature.ts`, `backend/lib/payments/easypaisa/signature.test.ts`
- `backend/lib/payments/easypaisa/callbackStateMachine.ts`, `backend/lib/payments/easypaisa/callbackStateMachine.test.ts`
- `backend/services/payments/easypaisa/easypaisa.service.ts`
- `backend/services/payments/easypaisa/localFinancialEvent.ts`
- `docs/phase-10-completion-report.md` (this file)

**Modified:**
- `supabase/functions/payments/index.ts` — replaced the Phase 1 `NotImplementedYetError` stub with the real router (`/easypaisa/initiate`, `/easypaisa/callback`, `/easypaisa/refund`, `/easypaisa/reconciliation/:id`).
- `backend/lib/validation/index.ts` — added `easypaisaInitiateSchema`, `easypaisaRefundSchema`.
- `backend/lib/providers/providers.test.ts` — extended Easypaisa coverage (see Tests section).
- `backend/services/payments/easypaisa/README.md` — status updated from "not started" to implemented, with a pointer to where the pure logic actually lives.

**Not modified (verified unchanged/compatible):**
- `backend/lib/providers/easypaisa/EasypaisaProvider.ts` — already correct per spec.
- `backend/services/orders/orders.service.ts` — COD and the existing `pending`-payment-row-at-checkout behavior verified intact.
- `supabase/functions/integrations-easypaisa/index.ts` — Phase 1's direct-provider-call wiring left as-is.
- `src/pages/Checkout.jsx` and the rest of the storefront — no UI changes this phase.

**Deleted:** none.

## Migrations/configuration required

- No new migration to run — Phase 1's `0007_payments.sql` and `0011_accounting_erp_sync.sql` are sufficient.
- Deploy the updated `payments` Edge Function (`supabase functions deploy payments`).
- The real `EASYPAISA_*` secrets are still blank (unchanged from Phase 1) and must be set via `supabase secrets set` before anything in this phase can do a real provider call:
  - `EASYPAISA_MERCHANT_ID`
  - `EASYPAISA_STORE_ID`
  - `EASYPAISA_HASH_KEY`
  - `EASYPAISA_API_BASE_URL`
  - `EASYPAISA_WEBHOOK_SECRET`
- All five already exist (blank) in `.env.example` from Phase 1 — confirmed, no changes needed there.

## Known limitations/deferred items

- **No real Easypaisa API contract was available.** The initiation flow shape, callback payload field names, and webhook signature scheme are all documented best-guess skeletons pending real Easypaisa merchant integration docs and credentials. Whoever gets access to those docs must revisit `backend/lib/payments/easypaisa/signature.ts` (header name, digest encoding, canonicalization) and `backend/services/payments/easypaisa/easypaisa.service.ts`'s `EasypaisaCallbackPayload` field names before any real webhook can be trusted.
- **Phase 7 accounting integration is intentionally duplicated, to be consolidated.** `localFinancialEvent.ts` inserts directly into `local_financial_transactions` rather than calling Phase 7's `accounting.service.ts`, because Phase 7 was not guaranteed to exist in this worktree at implementation time (parallel sibling agent). This must be consolidated into a single insert path once both phases are merged — see that file's header comment for detail.
- **No UI** — Phase 12's job, as scoped. The current checkout correctly still describes Easypaisa as "coming soon" and never calls the new endpoints.
- **No integration tests against a live Supabase project or a live Easypaisa sandbox** — none exists in this environment, consistent with every prior phase's documented limitation. The service-layer DB orchestration is unverified beyond typecheck/build; the actual decision logic (state machine, signature verification) is fully unit tested.
- **Rate limiting on `/payments` is infrastructure-level only** (Supabase/Hostinger), not a custom limiter — same category of gap Phase 6 flagged for guest order lookup.
- **Refund initiation has no admin UI or notification flow** — the service/endpoint exists (`POST /easypaisa/refund`), but nothing currently calls it; that's an admin-tooling phase's job.

## Next-phase readiness

Phase 10 is complete per spec within the constraint that no real Easypaisa credentials exist: the full architecture — payment-intent-before-redirect, initiation flow shape, callback/webhook framework with signature verification, idempotent status state machine, refund skeleton, and sanitized admin reconciliation — is in place and tested where the actual logic lives (state machine + signature verification), while every real-API call remains a clean, typed, never-fake-success `IntegrationNotConfiguredError`. COD is verified unbroken. Phase 8 (LedGix ERP) has an explicit `TODO` hook point in `easypaisa.service.ts` to create the ERP receipt once it's live. Phase 7 (Local Accounting), once merged, should absorb `localFinancialEvent.ts`'s temporary insert logic into its own service. Phase 12 (Admin UI) has real, audited, sanitized service functions (`getPaymentReconciliationDetail`, `refundEasypaisaPayment`) to build against without needing to touch this phase's files again.
