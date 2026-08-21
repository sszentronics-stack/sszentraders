/**
 * Tracking sync + customer-facing timeline — Phase 11.
 *
 * `syncShipmentStatus` is the framework for pulling live status from
 * Leopards (throws IntegrationNotConfiguredError today, via the provider)
 * and, once real data exists, feeding it through the status-normalization
 * layer (./statusNormalization.ts) before writing anything. It NEVER writes
 * a status derived from anything other than an actual provider response —
 * there is no fallback/simulated progression.
 *
 * `getOrderTrackingTimeline` is a pure read building a customer-safe
 * timeline shape from `shipment_events` — this is service-layer data only;
 * Phase 12/mobile (or a future storefront page) builds the UI on top of it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CourierProvider } from '../../../lib/providers/CourierProvider.ts'
import { NotFoundError, ValidationError } from '../../../lib/errors/index.ts'
import { getShipmentOrThrow, type ShipmentRecord } from './shipment.service.ts'
import { recordAdjustmentTransaction } from '../../accounting/accounting.service.ts'
import { requiresAccountingReview, resolveShipmentStatusUpdate, type ShipmentStatus } from './statusNormalization.ts'

async function getLastEventAt(db: SupabaseClient, shipmentId: string): Promise<string | null> {
  const { data, error } = await db
    .from('shipment_events')
    .select('created_at')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data?.created_at as string | undefined) ?? null
}

/**
 * Pull live tracking status for a shipment and (once a real provider
 * exists) apply the normalized status update. Today, `provider.trackShipment`
 * always throws IntegrationNotConfiguredError, which propagates unchanged —
 * no shipment_events row is written on a failed sync attempt, since there is
 * genuinely nothing to record beyond "we tried and the integration isn't
 * configured" (which the Edge Function's error response already conveys).
 */
export async function syncShipmentStatus(db: SupabaseClient, provider: CourierProvider, shipmentId: string): Promise<ShipmentRecord> {
  const shipment = await getShipmentOrThrow(db, shipmentId)
  if (!shipment.trackingNumber) {
    throw new ValidationError('Shipment has not been booked with a courier yet — nothing to sync.')
  }

  const result = await provider.trackShipment({ trackingNumber: shipment.trackingNumber })

  // Everything below only runs once a real provider actually returns data —
  // written now so the normalization layer has a concrete, tested caller.
  return applyRawStatusUpdate(db, shipment, {
    rawStatus: result.status,
    eventAt: result.lastUpdatedAt,
    eventType: 'tracking_sync',
  })
}

/**
 * Shared apply path for both the polling sync above and an inbound
 * webhook callback (see supabase/functions/integrations-leopards/index.ts's
 * 'webhook' operation) — both ultimately have "a raw status string + an
 * event timestamp for a known shipment" and need the exact same
 * normalization/staleness/RTO-review handling, so this is the one place
 * that logic lives.
 */
export async function applyRawStatusUpdate(
  db: SupabaseClient,
  shipment: ShipmentRecord,
  input: { rawStatus: string; eventAt: string; eventType: string; rawPayload?: unknown },
): Promise<ShipmentRecord> {
  const lastEventAt = await getLastEventAt(db, shipment.id)
  const decision = resolveShipmentStatusUpdate({
    currentStatus: shipment.status,
    lastEventAt,
    rawStatus: input.rawStatus,
    eventAt: input.eventAt,
  })

  await db.from('shipment_events').insert({
    shipment_id: shipment.id,
    provider: 'leopards',
    event_type: input.eventType,
    status: decision.action === 'apply' ? decision.normalizedStatus : shipment.status,
    raw_payload: input.rawPayload ?? { rawStatus: input.rawStatus, eventAt: input.eventAt, decision: decision.action },
  })

  if (decision.action !== 'apply') {
    return shipment // stale/unknown/invalid-transition update — diagnostic event recorded, nothing else changes
  }

  const { data: updated, error } = await db
    .from('shipments')
    .update({ status: decision.normalizedStatus })
    .eq('id', shipment.id)
    .select('id, order_id, return_id, purpose, provider, tracking_number, awb_number, status, booking_error, created_at')
    .single()
  if (error) throw error

  if (requiresAccountingReview(decision.normalizedStatus) && shipment.orderId) {
    // RTO/failed-delivery: flag for review only — availability resync is
    // Phase 9's job, and this function deliberately never touches inventory.
    // Consolidated in Phase 8 to call Phase 7's accounting.service.ts
    // directly (this phase originally shipped a self-contained
    // ./accountingReview.ts insert, since Phase 7 was a parallel sibling
    // agent at the time — see docs/phase-8-completion-report.md).
    await recordAdjustmentTransaction(db, {
      orderId: shipment.orderId,
      shipmentId: shipment.id,
      reviewReason: decision.normalizedStatus,
    })
  }

  return {
    id: updated.id as string,
    orderId: updated.order_id as string | null,
    returnId: updated.return_id as string | null,
    purpose: updated.purpose as ShipmentRecord['purpose'],
    provider: updated.provider as string,
    trackingNumber: updated.tracking_number as string | null,
    awbNumber: updated.awb_number as string | null,
    status: updated.status as ShipmentStatus,
    bookingError: updated.booking_error as string | null,
    createdAt: updated.created_at as string,
  }
}

/** Look up a shipment by its courier tracking number — the webhook payload's only shipment identifier. */
export async function findShipmentByTrackingNumber(db: SupabaseClient, trackingNumber: string): Promise<ShipmentRecord | null> {
  const { data, error } = await db
    .from('shipments')
    .select('id, order_id, return_id, purpose, provider, tracking_number, awb_number, status, booking_error, created_at')
    .eq('tracking_number', trackingNumber)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    orderId: data.order_id as string | null,
    returnId: data.return_id as string | null,
    purpose: data.purpose as ShipmentRecord['purpose'],
    provider: data.provider as string,
    trackingNumber: data.tracking_number as string | null,
    awbNumber: data.awb_number as string | null,
    status: data.status as ShipmentStatus,
    bookingError: data.booking_error as string | null,
    createdAt: data.created_at as string,
  }
}

export interface TrackingTimelineEntry {
  status: string | null
  eventType: string
  occurredAt: string
}

export interface OrderTrackingTimeline {
  orderId: string
  shipments: {
    shipmentId: string
    purpose: 'outbound' | 'return'
    trackingNumber: string | null
    currentStatus: string
    events: TrackingTimelineEntry[]
  }[]
}

interface TimelineShipmentRow {
  id: string
  purpose: string
  tracking_number: string | null
  status: string
}

interface TimelineEventRow {
  shipment_id: string
  event_type: string
  status: string | null
  created_at: string
}

/**
 * Customer-safe order tracking timeline, built entirely from
 * `shipments`/`shipment_events`. Deliberately excludes `raw_payload`/
 * `provider_payload`/`request_payload` — those may carry internal courier
 * request/response detail that shouldn't be echoed to a customer-facing
 * response shape. Caller (the Edge Function) is responsible for verifying
 * the requester owns this order before calling this function — mirrors
 * orders.service.ts's getOrderForCaller() ownership-check pattern.
 */
export async function getOrderTrackingTimeline(db: SupabaseClient, orderId: string): Promise<OrderTrackingTimeline> {
  const { data: shipmentRows, error: shipmentsError } = await db
    .from('shipments')
    .select('id, purpose, tracking_number, status')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (shipmentsError) throw shipmentsError
  const shipments = (shipmentRows ?? []) as TimelineShipmentRow[]
  if (shipments.length === 0) throw new NotFoundError('Shipment', 'No shipments exist yet for this order.')

  const shipmentIds = shipments.map((s) => s.id)
  const { data: eventRows, error: eventsError } = await db
    .from('shipment_events')
    .select('shipment_id, event_type, status, created_at')
    .in('shipment_id', shipmentIds)
    .order('created_at', { ascending: true })
  if (eventsError) throw eventsError
  const events = (eventRows ?? []) as TimelineEventRow[]

  return {
    orderId,
    shipments: shipments.map((s) => ({
      shipmentId: s.id,
      purpose: s.purpose as 'outbound' | 'return',
      trackingNumber: s.tracking_number,
      currentStatus: s.status,
      events: events
        .filter((e) => e.shipment_id === s.id)
        .map((e) => ({ status: e.status, eventType: e.event_type, occurredAt: e.created_at })),
    })),
  }
}
