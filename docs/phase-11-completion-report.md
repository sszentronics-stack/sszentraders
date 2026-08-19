# Phase 11 Completion Report — Leopards Courier Fulfilment & Returns

## Implementation summary

Phase 11 builds the full operational architecture for Leopards Courier fulfilment and courier-side returns handling — shipment/AWB record model, booking request shapes, tracking sync framework, status normalization layer, and admin reconciliation queries — while every actual HTTP call to the real Leopards API still throws `IntegrationNotConfiguredError`, exactly as the project's own rule requires ("do not invent external API behaviour/endpoints/credentials... create explicit non-configured adapters that fail safely"). No real Leopards API documentation or credentials exist in this project, so nothing here fabricates a booking, AWB, tracking result, or webhook field name as if it were confirmed.

Delivered:
- `CourierProvider` interface extended with `requestPickup`/`bookReturnPickup` (Phase 1 only had `createShipment`/`trackShipment`/`cancelShipment`); `TrackShipmentResult.status` changed from a fixed union to a raw provider string, since real Leopards status vocabulary is unknown and normalization now happens one layer up.
- `LeopardsCourierProvider` completed: every method (including the two new ones) throws `IntegrationNotConfiguredError`, whether or not API credentials are present — configuration presence never implies a working integration.
- `backend/services/delivery/leopards/` (new): `shipment.service.ts` (booking/pickup/cancel/return-pickup, all DB-backed, idempotent), `tracking.service.ts` (sync + webhook-shared apply path + customer tracking timeline), `statusNormalization.ts` (pure, fully tested generic-courier-state → Aura-status mapping + transition/staleness guard), `accountingReview.ts` (self-contained RTO/failed-delivery review flag, writes directly to `local_financial_transactions`), `webhook.ts` (best-guess HMAC signature verification), `admin.service.ts` (reconciliation queries + audited retry/refresh actions).
- `supabase/functions/shipments/index.ts` rebuilt from the Phase 1 `NotImplementedYetError` stub into the real domain router: `book`, `requestPickup`, `cancel`, `bookReturnPickup`, `syncStatus`, `reconciliation`, `retryBooking`, `refreshTracking` (all admin-only) and `trackingTimeline` (customer-reachable, ownership-checked).
- `supabase/functions/integrations-leopards/index.ts` extended: still the thin raw-provider passthrough, plus a `/webhook` receiver that verifies the HMAC signature before touching anything.
- Migration `0019_leopards_shipments.sql`: new `shipment_status` enum values, new `shipments` columns, duplicate-booking-prevention indexes.
- Tests: `providers.test.ts` extended; four new test files under `backend/services/delivery/leopards/` (`statusNormalization.test.ts`, `webhook.test.ts`, `shipment.service.test.ts`, `tracking.service.test.ts`) — 180 total suite tests pass, up from the pre-existing count.

## Architecture and key decisions

- **Persist-first, propagate-second booking.** `bookShipmentForOrder` always writes a `shipments` row (`pending_booking`, with a sanitized `request_payload` snapshot of what would be sent) *before* calling the provider, and lets any thrown error propagate after recording it on the row (`booking_error`, `booking_attempted_at`) and in `shipment_events`. The Edge Function needs no special-casing — `withErrorHandling`'s existing `toAppError()` already turns `IntegrationNotConfiguredError` into a clean `501 integration_not_configured` response, so "surface a clean typed error rather than crashing" fell out of reusing Phase 1's error taxonomy rather than inventing a new one.
- **Status normalization is a real, separately-testable layer**, independent of any live provider data. `statusNormalization.ts` maps a best-guess generic courier vocabulary (`booked`/`picked_up`/`in_transit`/`out_for_delivery`/`delivered`/`failed_delivery`/`rto_initiated`/`rto_in_transit`/`rto_delivered`/`cancelled`) onto Aura's own `shipment_status` enum, with an explicit allowed-transition graph (mirroring `backend/lib/status`'s `ORDER_TRANSITIONS` pattern) and a timestamp-based staleness guard so an out-of-order webhook/poll never regresses a shipment's state. `resolveShipmentStatusUpdate()` is the single decision point both the polling sync path and the webhook path funnel through (`applyRawStatusUpdate()` in `tracking.service.ts`), so there is exactly one place this logic lives.
- **Idempotency/duplicate-booking prevention is two-layered**: a pre-check in `bookShipmentForOrder` (look up an existing non-cancelled `outbound` shipment for the order and return it as-is) plus a database-level partial unique index (`uq_shipments_order_outbound_active`) so a race between two concurrent booking requests still can't create two rows. A caller-supplied `idempotency_key` column additionally protects a single retried request, mirroring (not reusing) `backend/lib/idempotency`'s pattern — shipment booking doesn't need the full request-hash/replay machinery that endpoint already has, just uniqueness.
- **RTO/failed-delivery never touches inventory or guesses a financial amount.** `syncShipmentStatus`/`applyRawStatusUpdate` calls `recordCourierAccountingReview()` when a normalized status is `failed_delivery`/`rto_initiated`/`rto_in_transit`/`rto_delivered`, which inserts an `adjustment` row into `local_financial_transactions` with `amount = 0` and a description explaining what needs manual review — deliberately never assuming a refund/write-off amount. Nothing in this phase writes to `inventory_cache` or any inventory-shaped table (Phase 9's job).
- **Concurrency-safe accounting write.** Per the task's explicit instruction, `accountingReview.ts` does **not** import from `backend/services/accounting/` (Phase 7, a sibling agent, may not have merged yet) — it inserts directly into `local_financial_transactions` via its own minimal client-shape interface. This is a documented, deliberate duplication; see "Known limitations" below.
- **Webhook verification is a documented best-guess.** No real Leopards webhook documentation exists (whether they send webhooks at all is unconfirmed). `webhook.ts` implements a generic HMAC-SHA256-over-raw-body scheme — the same shape Phase 10 (Easypaisa) uses for its own callback verification — with a `sha256=`-prefix tolerance and constant-time comparison. It fails closed: no configured secret means verification is refused outright (`WebhookSecretNotConfiguredError`), never silently "passes."
- **Return-pickup booking reuses the `shipments` table** (a `purpose = 'return'` row with `return_id` set) rather than a parallel table, since a return pickup is physically still "a Leopards shipment" sharing the same tracking/event machinery. Full return approval/inspection workflow is explicitly Phase 14's — this phase only builds the courier-side booking call shape `bookReturnPickup()` invokes once a return is already `approved`.
- **`TrackShipmentResult.status` widened from a fixed union to `string`.** The Phase 1 interface pre-guessed Aura-shaped status values; since we don't know Leopards' real raw vocabulary (casing, exact words, whether RTO has its own states), the provider-facing type now carries the raw string verbatim and normalization happens strictly in `statusNormalization.ts`.
- **Test-only in-memory Supabase fake** (`testUtils.ts`) implements only the specific query-builder surface these services actually call (select/insert/update, eq/neq/in/not, order/limit, maybeSingle/single, thenable list queries) — not a general mock, kept intentionally small and not exported for use outside this directory's tests.
- **`vite.config.js`'s test `include`** was extended to add `backend/services/**/*.test.ts` (previously only `backend/lib/**/*.test.ts` and `src/**/*.test.ts` were picked up by Vitest) — otherwise this phase's four new service-layer test files would never run. This is an additive, low-risk change that also benefits any future `backend/services/**` test file from other phases.

## Database-schema changes

New migration: `supabase/migrations/0019_leopards_shipments.sql`.
- `shipment_status` enum gains `pending_booking` (a shipments row created locally before any courier booking has succeeded — distinct from the pre-existing `pending`, reserved for "courier acknowledged the booking"), and `rto_initiated`/`rto_in_transit`/`rto_delivered` (finer-grained than the original single `returned`, which is kept as a legacy/generic alias — Postgres enums can't safely drop a value).
- `shipments` gains: `purpose` (`outbound` | `return`, checked), `return_id` (FK to `returns`, required when `purpose = 'return'`), `request_payload` (jsonb, sanitized outbound booking-request snapshot), `booking_error` (text), `booking_attempted_at` (timestamptz), `idempotency_key` (text).
- New indexes: `idx_shipments_return_id`, `idx_shipments_purpose`, a partial unique index preventing more than one active outbound shipment per order (`uq_shipments_order_outbound_active`), and a partial unique index on `idempotency_key`.
- No changes to `returns`/`return_items`/`return_events` (0009) — Phase 1's schema for the courier-side pickup portion this phase needed was already sufficient (an approved return's order supplies the pickup address).
- RLS (`0014_row_level_security.sql`) was **not** modified: `shipments_self_read` already scopes customer reads correctly for the new columns (columns, not rows, changed), and the new admin/service-layer reconciliation/tracking-timeline functions run through the Edge Function's service-role client with explicit application-layer ownership/admin checks (same pattern `orders.service.ts`'s `getOrderForCaller()` established), not through RLS-scoped client access.

## UI/UX changes

None. Per the spec, this phase is service-layer/Edge-Function only — "Expose a customer order tracking timeline data shape (service-layer function, not UI — Phase 12/mobile builds UI)" and "admin-facing (service-layer, not UI) shipment/reconciliation query functions." No frontend files were touched.

## Security and permissions

- Every mutating/booking/reconciliation action in `supabase/functions/shipments/index.ts` requires `requireAdmin()` (existing Phase 3 shared helper) except `trackingTimeline`, which requires a valid caller (`requireCallerProfile`) and an explicit order-ownership check mirroring `orders.service.ts`'s `getOrderForCaller()` — a customer requesting another customer's order timeline gets a generic `NotFoundError`, never a distinguishable 403.
- Leopards credentials (`LEOPARDS_API_KEY`/`LEOPARDS_API_PASSWORD`/`LEOPARDS_API_BASE_URL`) and the new `LEOPARDS_WEBHOOK_SECRET` are read exclusively through `supabase/functions/_shared/config.ts`, server-side only, never present in the Vite build.
- The webhook receiver fails closed on a missing secret or a bad/missing signature (`501`/`401`), and only ever mutates a shipment it can positively match by tracking number.
- `getOrderTrackingTimeline()` deliberately excludes `raw_payload`/`provider_payload`/`request_payload` from its customer-facing shape — internal courier request/response detail never leaks to a customer response.
- `accountingReview.ts`'s writer interface and `backend/lib/audit`'s `writeAuditLog()` (used throughout `admin.service.ts`) both refuse metadata that looks like a secret, consistent with existing project-wide logging/audit discipline.
- No secrets are ever logged; `backend/lib/logger`'s existing redaction is untouched and still applies to any Edge Function logging in this phase's code paths.

## External integration impact

None on any live system — no real Leopards API calls are made (every path throws `IntegrationNotConfiguredError`), and the webhook receiver only activates once `LEOPARDS_WEBHOOK_SECRET` is set, which it isn't in this environment. No existing Phase 6 checkout/order flow was modified — `orders.service.ts` is untouched; shipment booking is a separate, later step an admin/ops workflow triggers once an order reaches `packed`/`ready_for_pickup`.

## Tests and build results

```
npm run typecheck   # tsc --noEmit -p tsconfig.json — passes, no errors
npm run lint        # oxlint — passes; only 4 pre-existing warnings in src/context/*.jsx, unrelated to this phase
npm run test         # vitest run — 24 test files, 180 tests, all passing
npm run build        # vite build — succeeds, dist/ produced (pre-existing >500kB single-chunk warning, unrelated to this phase)
```

New/extended test coverage:
- `backend/lib/providers/providers.test.ts` — `LeopardsCourierProvider` now also asserts `trackShipment`/`cancelShipment`/`requestPickup`/`bookReturnPickup` all reject with `IntegrationNotConfiguredError`, and that a "configured" (non-null config) instance still rejects.
- `backend/services/delivery/leopards/statusNormalization.test.ts` — raw-status synonym mapping, generic→Aura mapping, the full allowed-transition graph (including `failed_delivery`'s two valid branches), stale/out-of-order event rejection, unrecognized-status rejection, idempotent same-status re-application, and the accounting-review-triggering status set.
- `backend/services/delivery/leopards/webhook.test.ts` — valid signature acceptance (with and without a `sha256=` prefix), tampered-body rejection, wrong-secret rejection, missing-header rejection, and the fail-closed "no secret configured" throw.
- `backend/services/delivery/leopards/shipment.service.test.ts` — order-status and consignee-field validation, `pending_booking` row creation + `IntegrationNotConfiguredError` propagation using the **real** `LeopardsCourierProvider(null)` (not a test double, to prove no fabricated success), COD-amount mapping onto the request payload (present only for `payment_method: 'cod'`, absent otherwise), duplicate-booking prevention (a second `bookShipmentForOrder` call reuses the existing row and never calls `provider.createShipment` a second time), and cancellation behavior (no provider call for a never-booked shipment; rejection when already delivered).
- `backend/services/delivery/leopards/tracking.service.test.ts` — refusal to sync an unbooked shipment, a valid forward transition applied from a constructed fixture provider response, an RTO status triggering exactly one `local_financial_transactions` row with `amount: 0` and zero writes to any inventory-shaped table, an unrecognized raw status being ignored, and the customer-safe tracking timeline shape (event list built correctly, no raw payload leakage, `NotFoundError` when an order has no shipments yet).

All fixtures used in tests are explicitly self-constructed (commented as such in the test files) — none claim to be real Leopards API sample payloads.

## Files created/modified/deleted

**Created:**
- `supabase/migrations/0019_leopards_shipments.sql`
- `backend/services/delivery/leopards/statusNormalization.ts` (+ `.test.ts`)
- `backend/services/delivery/leopards/webhook.ts` (+ `.test.ts`)
- `backend/services/delivery/leopards/accountingReview.ts`
- `backend/services/delivery/leopards/shipment.service.ts` (+ `.test.ts`)
- `backend/services/delivery/leopards/tracking.service.ts` (+ `.test.ts`)
- `backend/services/delivery/leopards/admin.service.ts`
- `backend/services/delivery/leopards/testUtils.ts`
- `docs/phase-11-completion-report.md` (this file)

**Modified:**
- `backend/lib/providers/CourierProvider.ts` — added `RequestPickupInput/Result`, `BookReturnPickupInput/Result`, widened `TrackShipmentResult.status` to `string`.
- `backend/lib/providers/leopards/LeopardsCourierProvider.ts` — implemented `requestPickup`/`bookReturnPickup` (both not-configured), refreshed doc comments.
- `backend/lib/providers/providers.test.ts` — extended Leopards coverage.
- `supabase/functions/shipments/index.ts` — rebuilt from `NotImplementedYetError` stub into the real router.
- `supabase/functions/integrations-leopards/index.ts` — added `requestPickup`/`bookReturnPickup` passthrough operations and the `/webhook` receiver.
- `supabase/functions/_shared/config.ts` — added `getLeopardsWebhookSecret()`.
- `.env.example` — added `LEOPARDS_WEBHOOK_SECRET=`.
- `supabase/migrations/README.md` — added the `0019` row.
- `backend/services/delivery/leopards/README.md` — replaced the Phase 1 placeholder with the real module map.
- `vite.config.js` — extended Vitest `include` to also pick up `backend/services/**/*.test.ts`.

**Deleted:** none.

## Migrations/configuration required

- Apply `supabase/migrations/0019_leopards_shipments.sql` (in order, after `0018`) once a live Supabase project exists — no live project/credentials exist in this environment, consistent with every prior phase.
- Real, still-blank env vars (server-side Edge Function secrets only, per `.env.example`):
  - `LEOPARDS_API_KEY`
  - `LEOPARDS_API_PASSWORD`
  - `LEOPARDS_API_BASE_URL`
  - `LEOPARDS_WEBHOOK_SECRET` (new in this phase)

## Known limitations/deferred items

- **No real Leopards API contract was available.** Every field name (`recipientName`, `codAmount`, etc.), the booking/tracking/cancel/pickup/return-pickup endpoints, and whether pickup is a separate call from booking are documented best-guesses pending real Leopards API docs/credentials. Only `LeopardsCourierProvider`'s method bodies (and the request-payload shape builders in `shipment.service.ts`) need to change once real docs exist — the surrounding architecture (shipment record model, status normalization, tracking sync framework, admin reconciliation) does not.
- **The status-normalization layer (`statusNormalization.ts`) is real and fully tested even though no live provider data feeds it today.** Its generic-state vocabulary (`booked`/`picked_up`/.../`rto_delivered`) and raw-string synonym table are a best guess at what a typical Pakistani courier's states look like — extend the synonym table (never the transition/staleness logic) once real sample payloads exist.
- **The webhook signature scheme (`webhook.ts`) is a best guess** (generic HMAC-SHA256 over the raw body, optional `sha256=` prefix, `X-Leopards-Signature` header) — Leopards may not even offer webhooks (polling via `syncShipmentStatus`/`manualRefreshShipmentTracking` would then be the only sync path). Confirm against real docs before relying on it in production.
- **Phase 7 (Local Accounting) integration is deliberately duplicated, not consolidated.** `accountingReview.ts` writes directly to `local_financial_transactions` because Phase 7 (a sibling agent, per the task's concurrency note) may not have merged when this phase was built, and this phase was instructed not to import from `backend/services/accounting/`. Once both phases are merged, a follow-up pass should replace `accountingReview.ts`'s direct insert with a call into Phase 7's accounting service (if one offers an equivalent "flag for review" entrypoint), rather than keeping two independent writers to the same table.
- **No package weight/dimensions are captured on an order**, so the booking request payload does not include them — Phase 6's order model has no such field. If Leopards' real booking API requires weight/dimensions, that's a Phase 6/checkout-level schema addition, out of this phase's scope.
- **Availability/inventory resync on RTO is explicitly not implemented here** (confirmed as Phase 9's responsibility) — `applyRawStatusUpdate()` never touches `inventory_cache` or any product-availability table, verified by a dedicated test.
- **Cutoff-window rules for courier cancellation** are unconfirmed pending real docs; `cancelShipment()` only distinguishes "never booked with a real courier" (cancel locally, no provider call) from "was booked" (call the provider) — no time-based cutoff logic exists yet.
- **RLS was not extended for admin reconciliation/tracking-timeline reads** — these go through the service-role client with application-layer checks (matching the existing `orders.service.ts` pattern), not through a new RLS policy path. This is consistent with how every other admin-only Edge Function action in this codebase already works.

## Next-phase readiness

- Phase 12 (or a future admin/mobile UI phase) can build directly on `getOrderTrackingTimeline()` and `listShipmentsForReconciliation()` — both are stable, tested, UI-agnostic data shapes.
- Phase 14 (Reviews, Returns & Customer Service) can call `bookReturnPickup()` the moment a `returns` row reaches `status = 'approved'` — no further courier-side plumbing is needed from that phase for the pickup-booking step itself; Phase 14 still owns the approval decision and the post-pickup inspection/refund workflow.
- Once real Leopards credentials/docs exist, wiring them in is: (1) fill in the four `LEOPARDS_*` env vars, (2) replace the `throw new IntegrationNotConfiguredError(...)` bodies in `LeopardsCourierProvider` with real HTTP calls matching the real API's actual field names/endpoints, (3) extend `RAW_STATUS_SYNONYMS` in `statusNormalization.ts` with the real status vocabulary, (4) confirm the webhook scheme in `webhook.ts` against real docs. No other file in this phase should need to change.
