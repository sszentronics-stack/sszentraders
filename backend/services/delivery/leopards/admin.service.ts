/**
 * Admin-facing (service-layer only — no UI here, per spec) shipment
 * reconciliation queries and manual refresh/retry actions — Phase 11.
 * Every mutating action is audited via backend/lib/audit, same as every
 * other privileged action in this codebase.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeAuditLog, type AuditLogWriter } from '../../../lib/audit/index.ts'
import type { CourierProvider } from '../../../lib/providers/CourierProvider.ts'
import { bookShipmentForOrder, getShipmentOrThrow, type ShipmentRecord } from './shipment.service.ts'
import { syncShipmentStatus } from './tracking.service.ts'

export interface ReconciliationFilters {
  /** Only shipments with a non-null booking_error (i.e. the last attempted courier call failed). */
  onlyBookingErrors?: boolean
  limit?: number
}

interface ReconciliationRow {
  id: string
  order_id: string | null
  purpose: string
  status: string
  tracking_number: string | null
  booking_error: string | null
  booking_attempted_at: string | null
  updated_at: string
}

export interface ReconciliationEntry {
  shipmentId: string
  orderId: string | null
  purpose: string
  status: string
  trackingNumber: string | null
  bookingError: string | null
  bookingAttemptedAt: string | null
  updatedAt: string
  needsAttention: boolean
}

const ATTENTION_STATUSES = new Set(['pending_booking', 'failed_delivery', 'rto_initiated', 'rto_in_transit'])

/**
 * Admin reconciliation feed: shipments that either failed their last
 * courier call, or sit in a status that generally warrants a human look
 * (still pending_booking, failed delivery, or mid-RTO). Ordered
 * most-recently-touched first so an admin sees what changed most recently.
 */
export async function listShipmentsForReconciliation(
  db: SupabaseClient,
  filters: ReconciliationFilters = {},
): Promise<ReconciliationEntry[]> {
  let query = db
    .from('shipments')
    .select('id, order_id, purpose, status, tracking_number, booking_error, booking_attempted_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(filters.limit ?? 50)

  if (filters.onlyBookingErrors) {
    query = query.not('booking_error', 'is', null)
  }

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as ReconciliationRow[]).map((row) => ({
    shipmentId: row.id,
    orderId: row.order_id,
    purpose: row.purpose,
    status: row.status,
    trackingNumber: row.tracking_number,
    bookingError: row.booking_error,
    bookingAttemptedAt: row.booking_attempted_at,
    updatedAt: row.updated_at,
    needsAttention: Boolean(row.booking_error) || ATTENTION_STATUSES.has(row.status),
  }))
}

export interface AdminActor {
  profileId: string
  authUserId: string
}

/**
 * Manually retry booking a shipment stuck in `pending_booking` with a
 * recorded `booking_error` — re-runs the same booking attempt for the
 * shipment's order (bookShipmentForOrder is itself idempotent: it will
 * simply return the existing row if it's already booked/no longer
 * cancellable-and-retryable).
 */
export async function retryShipmentBooking(
  db: SupabaseClient & AuditLogWriter,
  provider: CourierProvider,
  shipmentId: string,
  actor: AdminActor,
): Promise<ShipmentRecord> {
  const shipment = await getShipmentOrThrow(db, shipmentId)
  if (!shipment.orderId) {
    throw new Error('Cannot retry booking for a shipment with no associated order (e.g. a return pickup) via this action.')
  }

  await writeAuditLog(db, {
    actor: actor.profileId,
    actorType: 'admin',
    action: 'shipment.booking_retry_attempted',
    entityType: 'shipment',
    entityId: shipmentId,
    metadata: { orderId: shipment.orderId },
  })

  try {
    const result = await bookShipmentForOrder(db, provider, shipment.orderId)
    await writeAuditLog(db, {
      actor: actor.profileId,
      actorType: 'admin',
      action: 'shipment.booking_retry_result',
      entityType: 'shipment',
      entityId: shipmentId,
      metadata: { status: result.status, bookingError: result.bookingError },
    })
    return result
  } catch (err) {
    await writeAuditLog(db, {
      actor: actor.profileId,
      actorType: 'admin',
      action: 'shipment.booking_retry_failed',
      entityType: 'shipment',
      entityId: shipmentId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    })
    throw err
  }
}

/** Manually re-pull tracking status for one shipment, audited the same way as the automatic sync path would be. */
export async function manualRefreshShipmentTracking(
  db: SupabaseClient & AuditLogWriter,
  provider: CourierProvider,
  shipmentId: string,
  actor: AdminActor,
): Promise<ShipmentRecord> {
  await writeAuditLog(db, {
    actor: actor.profileId,
    actorType: 'admin',
    action: 'shipment.tracking_manual_refresh',
    entityType: 'shipment',
    entityId: shipmentId,
  })
  return syncShipmentStatus(db, provider, shipmentId)
}
