# easypaisa

**Phase:** 10

Easypaisa payment initiation, redirect/checkout flow, callbacks/webhooks, server-side verification, duplicate-callback protection, reconciliation, refunds. Successful payment must produce a local accounting transaction and, once Phase 8 is live, an ERP receipt.

Status: not started (Phase 1 laid the foundation below).

## Phase 1 foundation
- Interface: `backend/lib/providers/PaymentProvider.ts`.
- Skeleton implementation: `backend/lib/providers/easypaisa/EasypaisaProvider.ts` — every method throws `IntegrationNotConfiguredError` until real credentials + Phase 10 logic land.
- Deployable code home: `supabase/functions/integrations-easypaisa/index.ts` (wires the skeleton to live Edge Function config from `EASYPAISA_*` secrets).
- Schema: `supabase/migrations/0007_payments.sql`.
