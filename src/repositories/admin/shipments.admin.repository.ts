/**
 * Admin shipment/AWB/tracking management — wraps the `shipments` Edge
 * Function's action-in-body dispatch (Phase 11's admin.service.ts). No
 * direct table reads here: `listShipmentsForReconciliation` already
 * assembles the exact "needs attention" queue shape (booking errors,
 * stale tracking) the dashboard/queue page needs.
 */
import { callEdgeFunction } from '../../lib/supabase/functions'

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

function callShipments<T>(action: string, body: Record<string, unknown> = {}) {
  return callEdgeFunction<T>('shipments', { method: 'POST', body: { action, ...body } })
}

export function listShipmentsForReconciliation(params: { onlyBookingErrors?: boolean; limit?: number } = {}) {
  return callShipments<ReconciliationEntry[]>('reconciliation', params)
}

export function retryShipmentBooking(shipmentId: string) {
  return callShipments<any>('retryBooking', { shipmentId })
}

export function refreshShipmentTracking(shipmentId: string) {
  return callShipments<any>('refreshTracking', { shipmentId })
}

export function bookShipment(orderId: string, idempotencyKey?: string) {
  return callShipments<any>('book', { orderId, idempotencyKey })
}

export function requestShipmentPickup(shipmentId: string) {
  return callShipments<any>('requestPickup', { shipmentId })
}

export function cancelShipment(shipmentId: string, reason?: string) {
  return callShipments<any>('cancel', { shipmentId, reason })
}

export function getOrderTrackingTimeline(orderId: string) {
  return callShipments<any>('trackingTimeline', { orderId })
}
