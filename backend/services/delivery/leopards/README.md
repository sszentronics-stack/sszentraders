# leopards

**Phase:** 11

Leopards Courier integration: shipment creation, pickup booking, AWB/tracking, delivery/failed-delivery, return-to-origin, customer return pickups. Courier events that are financially relevant flag an accounting review rather than guessing a financial outcome.

Status: **architecture implemented, real API calls not configured** (no Leopards API documentation/credentials exist in this project).

## Files
- `shipment.service.ts` — booking, pickup-request, cancellation, and customer-return-pickup booking, all DB-backed against `shipments`/`shipment_events`. Every booking call creates a local `pending_booking` shipment row first, then calls the provider and lets `IntegrationNotConfiguredError` propagate — the row persists either way.
- `tracking.service.ts` — `syncShipmentStatus()` (polling), `applyRawStatusUpdate()` (shared by polling and the webhook path), `findShipmentByTrackingNumber()`, and `getOrderTrackingTimeline()` (customer-safe timeline data shape, no UI).
- `statusNormalization.ts` — pure, fully tested mapping from generic courier states (booked/picked_up/in_transit/out_for_delivery/delivered/failed_delivery/rto_initiated/rto_in_transit/rto_delivered/cancelled) to Aura's `shipment_status` enum, plus the stale/out-of-order-update guard and the allowed-transition graph. Real logic today even though no live provider data feeds it yet.
- `accountingReview.ts` — writes directly to `local_financial_transactions` (never guesses an amount — always `0` + a description) when a shipment hits a review-triggering status. See its header comment for why this bypasses Phase 7's eventual accounting service (concurrency: Phase 7 may not have merged yet) and the note that a later pass should consolidate it.
- `webhook.ts` — best-guess generic HMAC-SHA256 webhook signature verification, pending real Leopards webhook docs.
- `admin.service.ts` — reconciliation queries + audited manual retry/refresh actions, service-layer only (no UI — Phase 12/mobile or a future admin UI phase builds on this).
- `testUtils.ts` — an in-memory fake Supabase query builder used only by this directory's `*.test.ts` files.

## Wiring
- Provider skeleton: `backend/lib/providers/leopards/LeopardsCourierProvider.ts` — every method throws `IntegrationNotConfiguredError`, never a fabricated success.
- Interface: `backend/lib/providers/CourierProvider.ts` (now includes `requestPickup` and `bookReturnPickup` alongside the Phase 1 `createShipment`/`trackShipment`/`cancelShipment`).
- Domain router (booking/pickup/cancel/tracking-timeline/reconciliation/retry): `supabase/functions/shipments/index.ts`.
- Thin provider passthrough + inbound webhook receiver: `supabase/functions/integrations-leopards/index.ts`.
- Schema: `supabase/migrations/0008_shipments.sql` (Phase 1) + `supabase/migrations/0019_leopards_shipments.sql` (Phase 11: `pending_booking`/RTO enum values, `purpose`/`return_id`/`request_payload`/`booking_error`/`idempotency_key` columns, duplicate-booking-prevention indexes).

## What's still missing
Real Leopards API documentation/credentials. Every field name, endpoint, and the webhook scheme are documented best-guesses — see docs/phase-11-completion-report.md's "Known limitations" section.
