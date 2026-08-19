# lib

**Phase:** 1 (+ ongoing)

Runtime-agnostic shared library code — pure TypeScript, no Node-only or
Deno-only APIs (only Web-standard globals like `crypto.subtle`), so the same
files can be imported both by Supabase Edge Functions (Deno, via relative
`.ts` imports — see `supabase/functions/_shared/http.ts`) and, where useful,
by Vite frontend code (via the `tsconfig.json` `@lib/*` path alias) without
a build step or a forked copy.

Status: **implemented** for the Phase 1 subset below. Each subfolder is the
single authoritative implementation for its responsibility — do not create a
second copy of any of this in `src/` or `supabase/functions/`.

| Folder | Responsibility |
|---|---|
| `money/` | Minor-unit money conversion, formatting, line/order total math. |
| `status/` | Order/payment/fulfillment status vocabularies + transition validation. |
| `idempotency/` | Request-hash + decision helper backing the `idempotency_keys` table. |
| `validation/` | Zod schemas for every mutation-boundary input shape. |
| `errors/` | Centralized `AppError` taxonomy (validation, auth, authorization, not_found, conflict, integration, server). |
| `response/` | Success/error response envelope built from `errors/`. |
| `logger/` | Structured JSON logging with secret-key redaction. |
| `audit/` | `writeAuditLog()` helper for the `audit_logs` table. |
| `providers/` | `ErpProvider` / `PaymentProvider` / `CourierProvider` interfaces + LedGix/Easypaisa/Leopards skeleton implementations that throw `IntegrationNotConfiguredError`. |
| `accounting/` | Phase 7: local financial-event vocabulary, idempotency-key builder, ERP-sync-state helpers. |
| `erp/` | Phase 8: pure LedGix ERP sync domain logic — financial-event → ERP document action mapping, sync-error classification, customer-sync decision, reconciliation comparison, and webhook signature verification (`erp/webhook.ts`). |
| `returns/` | Phase 14: reason-code vocabulary + evidence requirements, return-number generation, and the return-policy eligibility engine (delivered-date/window/quantity/reason checks). Return status transitions live in `status/` alongside order/payment status, not here. |
| `reviews/` | Phase 14: verified-purchase review eligibility decision and aggregate-rating computation. |
| `types/` | Hand-written domain types matching the Phase 1 schema (see `types/domain.ts` header for why these aren't CLI-generated yet). |

Tests live next to their source file (`*.test.ts`) and run via `npm test` (Vitest).
