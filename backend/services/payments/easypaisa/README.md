# easypaisa

**Phase:** 10

Easypaisa payment initiation, redirect/checkout flow, callbacks/webhooks, server-side verification, duplicate-callback protection, reconciliation, refunds. Successful payment must produce a local accounting transaction and, once Phase 8 is live, an ERP receipt.

Status: implemented (architecture/skeleton only — no real Easypaisa credentials are available; see `docs/phase-10-completion-report.md`).

## Phase 10 implementation
- `easypaisa.service.ts` — DB orchestration: `initiateEasypaisaPayment`, `handleEasypaisaCallback`, `refundEasypaisaPayment`, `getPaymentReconciliationDetail`. Depends on an injected `PaymentProvider` (never reads env itself). On a verified `paid` callback, calls Phase 7's `backend/services/accounting/accounting.service.ts`'s `recordPaymentTransaction` directly — the temporary `localFinancialEvent.ts` self-contained writer this phase originally shipped was deleted in Phase 8's consolidation pass (see `docs/phase-8-completion-report.md`).
- Pure, unit-tested logic (webhook signature verification, callback state machine) lives in `backend/lib/payments/easypaisa/` instead of here, matching this repo's existing convention that pure/testable logic lives under `backend/lib` while `backend/services` holds untested DB orchestration (see `backend/lib/orders` vs `backend/services/orders/orders.service.ts`). `vite.config.js`'s vitest `include` only scans `backend/lib/**/*.test.ts`, which was the deciding factor.
- Deployable code home: `supabase/functions/payments/index.ts` (real router — initiate/callback/refund/reconciliation) and `supabase/functions/integrations-easypaisa/index.ts` (unchanged Phase 1 low-level provider wiring, still used by `integrations-easypaisa`'s own direct-provider-call shape).
- Schema: `supabase/migrations/0007_payments.sql` (no schema changes were needed for Phase 10).

## Phase 1 foundation (unchanged)
- Interface: `backend/lib/providers/PaymentProvider.ts`.
- Skeleton implementation: `backend/lib/providers/easypaisa/EasypaisaProvider.ts` — every method throws `IntegrationNotConfiguredError` until real credentials are configured. Phase 10 does not change this file's throwing behavior — it is correct as shipped.
