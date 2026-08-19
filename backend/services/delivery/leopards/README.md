# leopards

**Phase:** 11

Leopards Courier integration: shipment creation, pickup booking, AWB/tracking, delivery/failed-delivery, return-to-origin, replacement shipments. Courier events that are financially relevant must trigger accounting/ERP actions.

Status: not started (Phase 1 laid the foundation below).

## Phase 1 foundation
- Interface: `backend/lib/providers/CourierProvider.ts`.
- Skeleton implementation: `backend/lib/providers/leopards/LeopardsCourierProvider.ts` — every method throws `IntegrationNotConfiguredError` until real credentials + Phase 11 logic land.
- Deployable code home: `supabase/functions/integrations-leopards/index.ts`.
- Schema: `supabase/migrations/0008_shipments.sql`.
