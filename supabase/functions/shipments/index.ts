/**
 * shipments — the real Phase 11 router (superseding the Phase 1
 * NotImplementedYetError stub) for backend/services/delivery/leopards.
 *
 * Booking/pickup/cancellation/reconciliation actions are admin-only
 * (they're operational triggers, not something a customer calls directly).
 * `trackingTimeline` is the one customer-reachable action — it's scoped to
 * the caller's own order using the same ownership-check pattern
 * orders.service.ts's getOrderForCaller() established in Phase 6.
 *
 * Every action here can throw IntegrationNotConfiguredError deep inside a
 * service call (e.g. booking) — that's expected and is turned into a clean
 * 501 `integration_not_configured` response by withErrorHandling
 * (backend/lib/errors's toAppError), never a crash or a fabricated success.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { requireCallerProfile } from '../_shared/callerAuth.ts'
import { getLeopardsConfig } from '../_shared/config.ts'
import { LeopardsCourierProvider } from '../../../backend/lib/providers/leopards/LeopardsCourierProvider.ts'
import { NotFoundError, ValidationError } from '../../../backend/lib/errors/index.ts'
import {
  bookReturnPickup,
  bookShipmentForOrder,
  cancelShipment,
  requestPickupForShipment,
} from '../../../backend/services/delivery/leopards/shipment.service.ts'
import { getOrderTrackingTimeline, syncShipmentStatus } from '../../../backend/services/delivery/leopards/tracking.service.ts'
import {
  listShipmentsForReconciliation,
  manualRefreshShipmentTracking,
  retryShipmentBooking,
} from '../../../backend/services/delivery/leopards/admin.service.ts'

async function assertOwnsOrder(db: ReturnType<typeof getSupabaseAdminClient>, profileId: string, isAdmin: boolean, orderId: string) {
  if (isAdmin) return
  const { data: customer } = await db.from('customers').select('id').eq('profile_id', profileId).maybeSingle()
  const { data: order } = await db.from('orders').select('customer_id').eq('id', orderId).maybeSingle()
  if (!customer || !order || order.customer_id !== customer.id) {
    throw new NotFoundError('Order') // never distinguish "not yours" from "doesn't exist"
  }
}

Deno.serve(
  withErrorHandling(async (req) => {
    const body = await req.json().catch(() => ({}))
    const action: string = body.action ?? 'trackingTimeline'
    const db = getSupabaseAdminClient()
    const provider = new LeopardsCourierProvider(getLeopardsConfig())

    switch (action) {
      case 'book': {
        await requireAdmin(req)
        if (!body.orderId) throw new ValidationError('orderId is required.')
        const shipment = await bookShipmentForOrder(db, provider, body.orderId, { idempotencyKey: body.idempotencyKey })
        return okResponse(shipment)
      }

      case 'requestPickup': {
        await requireAdmin(req)
        if (!body.shipmentId) throw new ValidationError('shipmentId is required.')
        const shipment = await requestPickupForShipment(db, provider, body.shipmentId)
        return okResponse(shipment)
      }

      case 'cancel': {
        await requireAdmin(req)
        if (!body.shipmentId) throw new ValidationError('shipmentId is required.')
        const shipment = await cancelShipment(db, provider, body.shipmentId, body.reason)
        return okResponse(shipment)
      }

      case 'bookReturnPickup': {
        await requireAdmin(req)
        if (!body.returnId) throw new ValidationError('returnId is required.')
        const shipment = await bookReturnPickup(db, provider, body.returnId)
        return okResponse(shipment)
      }

      case 'syncStatus': {
        await requireAdmin(req)
        if (!body.shipmentId) throw new ValidationError('shipmentId is required.')
        const shipment = await syncShipmentStatus(db, provider, body.shipmentId)
        return okResponse(shipment)
      }

      case 'reconciliation': {
        await requireAdmin(req)
        const entries = await listShipmentsForReconciliation(db, {
          onlyBookingErrors: Boolean(body.onlyBookingErrors),
          limit: body.limit,
        })
        return okResponse(entries)
      }

      case 'retryBooking': {
        const admin = await requireAdmin(req)
        if (!body.shipmentId) throw new ValidationError('shipmentId is required.')
        const shipment = await retryShipmentBooking(db, provider, body.shipmentId, admin)
        return okResponse(shipment)
      }

      case 'refreshTracking': {
        const admin = await requireAdmin(req)
        if (!body.shipmentId) throw new ValidationError('shipmentId is required.')
        const shipment = await manualRefreshShipmentTracking(db, provider, body.shipmentId, admin)
        return okResponse(shipment)
      }

      case 'trackingTimeline':
      default: {
        const caller = await requireCallerProfile(req)
        if (!body.orderId) throw new ValidationError('orderId is required.')
        await assertOwnsOrder(db, caller.id, caller.isAdmin, body.orderId)
        const timeline = await getOrderTrackingTimeline(db, body.orderId)
        return okResponse(timeline)
      }
    }
  }),
)
