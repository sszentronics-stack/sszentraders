# accounting

**Phase:** 7

Local fallback accounting: sales, payments, COD receivables, delivery charges, discounts, cancellations, refunds, returns — each record carries local transaction ID, ERP sync status, ERP reference ID, sync timestamps, error/retry history. Not the authoritative financial system; LedGix ERP (Phase 8) is.

Status: not started (Phase 1 laid the foundation below).

## Phase 1 foundation
- Schema: `supabase/migrations/0011_accounting_erp_sync.sql` (`local_financial_transactions`, `erp_sync_jobs`, `erp_sync_events`).
- Deployable code home: `supabase/functions/accounting/index.ts` (currently returns `NotImplementedYetError` — Phase 7 implements the real logic).
- This folder stays the conceptual/service-layer home; it does not contain deployable code itself.
