/**
 * Shipment booking/pickup/cancellation service — Phase 11.
 *
 * Every function here writes a real, persistent `shipments`/`shipment_events`
 * row FIRST (so the operational record always exists), then calls the
 * (currently not-configured) LeopardsCourierProvider and lets any
 * IntegrationNotConfiguredError propagate to the caller (an Edge Function
 * wrapped in withErrorHandling, which turns it into a clean 501
 * `integration_not_configured` response — see backend/lib/errors's
 * toAppError()). Nothing here ever fabricates a tracking number, AWB, or
 * "success" — that is the one hard rule this whole module exists to
 * enforce.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BookReturnPickupInput,
  CourierProvider,
  CreateShipmentInput,
  RequestPickupInput,
} from '../../../lib/providers/CourierProvider'
import { ConflictError, NotFoundError, ValidationError } from '../../../lib/errors'
import type { ShipmentStatus } from './statusNormalization'

export interface ShipmentRecord {
  id: string
  orderId: string | null
  returnId: string | null
  purpose: 'outbound' | 'return'
  provider: string
  trackingNumber: string | null
  awbNumber: string | null
  status: ShipmentStatus
  bookingError: string | null
  createdAt: string
}

interface ShipmentRow {
  id: string
  order_id: string | null
  return_id: string | null
  purpose: string
  provider: string
  tracking_number: string | null
  awb_number: string | null
  status: string
  booking_error: string | null
  created_at: string
}

function mapShipment(row: ShipmentRow): ShipmentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    returnId: row.return_id,
    purpose: row.purpose as ShipmentRecord['purpose'],
    provider: row.provider,
    trackingNumber: row.tracking_number,
    awbNumber: row.awb_number,
    status: row.status as ShipmentStatus,
    bookingError: row.booking_error,
    createdAt: row.created_at,
  }
}

const SHIPMENT_COLUMNS =
  'id, order_id, return_id, purpose, provider, tracking_number, awb_number, status, booking_error, created_at'

interface OrderForBookingRow {
  id: string
  order_number: string
  order_status: string
  payment_method: string | null
  grand_total: number
  currency: string
  shipping_recipient_name: string | null
  shipping_phone: string | null
  shipping_address_line_1: string | null
  shipping_address_line_2: string | null
  shipping_city: string | null
  shipping_province: string | null
  shipping_postal_code: string | null
}

const ORDER_FOR_BOOKING_COLUMNS = `
  id, order_number, order_status, payment_method, grand_total, currency, shipping_recipient_name, shipping_phone,
  shipping_address_line_1, shipping_address_line_2, shipping_city, shipping_province, shipping_postal_code
`

/** Orders eligible to have a shipment booked — mirrors Phase 6's order_status enum; booking happens once packed/ready. */
const BOOKABLE_ORDER_STATUSES = new Set(['packed', 'ready_for_pickup'])

function validateConsignee(order: OrderForBookingRow): void {
  const missing: { path: string; message: string }[] = []
  if (!order.shipping_recipient_name) missing.push({ path: 'shippingRecipientName', message: 'Recipient name is missing.' })
  if (!order.shipping_phone) missing.push({ path: 'shippingPhone', message: 'Recipient phone is missing.' })
  if (!order.shipping_address_line_1) missing.push({ path: 'shippingAddressLine1', message: 'Address line 1 is missing.' })
  if (!order.shipping_city) missing.push({ path: 'shippingCity', message: 'City is missing.' })
  if (missing.length > 0) {
    throw new ValidationError(
      `Order "${order.order_number}" is missing shipping details required to book a courier shipment.`,
      missing,
    )
  }
}

function buildCreateShipmentInput(order: OrderForBookingRow): CreateShipmentInput {
  return {
    orderId: order.id,
    recipientName: order.shipping_recipient_name as string,
    recipientPhone: order.shipping_phone as string,
    addressLine1: order.shipping_address_line_1 as string,
    addressLine2: order.shipping_address_line_2 ?? undefined,
    city: order.shipping_city as string,
    province: order.shipping_province ?? undefined,
    postalCode: order.shipping_postal_code ?? undefined,
    // COD amount only maps onto the shipment when the order's payment method
    // is actually COD — never conflate "shipped" with "paid" (Easypaisa/COD
    // reconciliation is Phase 10/7's concern, not this module's).
    codAmount: order.payment_method === 'cod' ? order.grand_total : undefined,
  }
}

/** Sanitized (no secrets, no internal ids beyond what's needed) snapshot of the request we WOULD send to Leopards. */
function buildSanitizedRequestPayload(input: CreateShipmentInput, orderNumber: string, currency: string) {
  return {
    orderNumber,
    currency,
    recipientName: input.recipientName,
    recipientPhone: input.recipientPhone,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 ?? null,
    city: input.city,
    province: input.province ?? null,
    postalCode: input.postalCode ?? null,
    codAmount: input.codAmount ?? null,
  }
}

/**
 * Book (attempt to book) a Leopards shipment for a packed/ready order.
 *
 * Duplicate-booking prevention: if an active (non-cancelled) outbound
 * shipment already exists for this order, it is returned as-is rather than
 * inserting a second row — enforced both here (a pre-check, for a fast/
 * clear ConflictError) and at the database level (0019's partial unique
 * index), so a race between two concurrent booking requests still can't
 * create two rows.
 */
export async function bookShipmentForOrder(
  db: SupabaseClient,
  provider: CourierProvider,
  orderId: string,
  opts: { idempotencyKey?: string } = {},
): Promise<ShipmentRecord> {
  const { data: orderRow, error: orderError } = await db
    .from('orders')
    .select(ORDER_FOR_BOOKING_COLUMNS)
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) throw orderError
  if (!orderRow) throw new NotFoundError('Order')
  const order = orderRow as OrderForBookingRow

  if (!BOOKABLE_ORDER_STATUSES.has(order.order_status)) {
    throw new ValidationError(
      `Order "${order.order_number}" must be packed or ready for pickup before a courier shipment can be booked (current status: "${order.order_status}").`,
    )
  }

  validateConsignee(order)

  const { data: existing, error: existingError } = await db
    .from('shipments')
    .select(SHIPMENT_COLUMNS)
    .eq('order_id', orderId)
    .eq('purpose', 'outbound')
    .neq('status', 'cancelled')
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return mapShipment(existing as ShipmentRow)

  const input = buildCreateShipmentInput(order)
  const requestPayload = buildSanitizedRequestPayload(input, order.order_number, order.currency)

  const { data: inserted, error: insertError } = await db
    .from('shipments')
    .insert({
      order_id: orderId,
      purpose: 'outbound',
      provider: 'leopards',
      status: 'pending_booking',
      request_payload: requestPayload,
      idempotency_key: opts.idempotencyKey ?? null,
    })
    .select(SHIPMENT_COLUMNS)
    .single()
  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') {
      throw new ConflictError(`A shipment booking is already in progress or exists for order "${order.order_number}".`)
    }
    throw insertError
  }
  const shipment = mapShipment(inserted as ShipmentRow)

  await db.from('shipment_events').insert({
    shipment_id: shipment.id,
    provider: 'leopards',
    event_type: 'booking_attempted',
    status: 'pending_booking',
    raw_payload: requestPayload,
  })

  try {
    const result = await provider.createShipment(input)
    // Not reachable until a real provider exists, but written correctly so
    // nothing changes here once it is: persist the real tracking/AWB and
    // move the local record out of pending_booking.
    const { data: updated, error: updateError } = await db
      .from('shipments')
      .update({
        tracking_number: result.trackingNumber,
        awb_number: result.awbNumber ?? null,
        status: result.status === 'pickup_requested' ? 'pickup_requested' : 'pending',
        provider_payload: result,
        booking_error: null,
        booking_attempted_at: new Date().toISOString(),
      })
      .eq('id', shipment.id)
      .select(SHIPMENT_COLUMNS)
      .single()
    if (updateError) throw updateError
    await db.from('shipment_events').insert({
      shipment_id: shipment.id,
      provider: 'leopards',
      event_type: 'booking_succeeded',
      status: (updated as ShipmentRow).status,
      raw_payload: result,
    })
    return mapShipment(updated as ShipmentRow)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .from('shipments')
      .update({ booking_error: message, booking_attempted_at: new Date().toISOString() })
      .eq('id', shipment.id)
    await db.from('shipment_events').insert({
      shipment_id: shipment.id,
      provider: 'leopards',
      event_type: 'booking_failed',
      status: 'pending_booking',
      raw_payload: { error: message },
    })
    // Re-throw so the Edge Function's withErrorHandling surfaces a clean
    // typed "courier booking unavailable" error — the shipments row above
    // already persists regardless, so this never "crashes" the operation.
    throw err
  }
}

/**
 * Pickup-request workflow, modeled as a call SEPARATE from booking — see
 * backend/lib/providers/CourierProvider.ts's RequestPickupInput doc for why
 * this needs confirming against real Leopards docs (booking may already
 * imply pickup for them).
 */
export async function requestPickupForShipment(
  db: SupabaseClient,
  provider: CourierProvider,
  shipmentId: string,
): Promise<ShipmentRecord> {
  const shipment = await getShipmentOrThrow(db, shipmentId)
  if (!shipment.trackingNumber) {
    throw new ValidationError('Cannot request a pickup for a shipment that has not been booked with the courier yet.')
  }

  const input: RequestPickupInput = { trackingNumber: shipment.trackingNumber }
  try {
    await provider.requestPickup(input)
    // Not reachable today (see above) — written for the real-provider case.
    const { data: updated, error } = await db
      .from('shipments')
      .update({ status: 'pickup_requested', pickup_requested_at: new Date().toISOString() })
      .eq('id', shipmentId)
      .select(SHIPMENT_COLUMNS)
      .single()
    if (error) throw error
    await db
      .from('shipment_events')
      .insert({ shipment_id: shipmentId, provider: 'leopards', event_type: 'pickup_requested', status: 'pickup_requested' })
    return mapShipment(updated as ShipmentRow)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.from('shipments').update({ booking_error: message }).eq('id', shipmentId)
    await db
      .from('shipment_events')
      .insert({ shipment_id: shipmentId, provider: 'leopards', event_type: 'pickup_request_failed', raw_payload: { error: message } })
    throw err
  }
}

/**
 * Courier cancellation. Only calls the provider if a real tracking number
 * exists (i.e. a booking previously succeeded with a real courier) —
 * otherwise there is nothing courier-side to cancel, so we just mark the
 * local record cancelled. The real API's cutoff-window rules (how late a
 * cancellation can happen before a pickup is already in motion) are
 * unconfirmed pending real Leopards docs; enforcing them is left to the
 * provider implementation once it exists.
 */
export async function cancelShipment(db: SupabaseClient, provider: CourierProvider, shipmentId: string, reason?: string): Promise<ShipmentRecord> {
  const shipment = await getShipmentOrThrow(db, shipmentId)
  if (shipment.status === 'cancelled') return shipment
  if (['delivered', 'rto_delivered'].includes(shipment.status)) {
    throw new ValidationError(`Shipment ${shipmentId} has already reached a terminal delivered/RTO state and cannot be cancelled.`)
  }

  if (shipment.trackingNumber) {
    await provider.cancelShipment({ trackingNumber: shipment.trackingNumber, reason })
  }

  const { data: updated, error } = await db
    .from('shipments')
    .update({ status: 'cancelled' })
    .eq('id', shipmentId)
    .select(SHIPMENT_COLUMNS)
    .single()
  if (error) throw error
  await db.from('shipment_events').insert({
    shipment_id: shipmentId,
    provider: 'leopards',
    event_type: 'cancelled',
    status: 'cancelled',
    raw_payload: reason ? { reason } : null,
  })
  return mapShipment(updated as ShipmentRow)
}

interface ReturnForPickupRow {
  id: string
  order_id: string
  status: string
}

/**
 * Customer return pickup booking shape (courier-side call only — the
 * approval decision and post-pickup inspection workflow are Phase 14's).
 * Origin address for the pickup is the order's shipping address snapshot
 * (the courier collects FROM the customer), which is the same data
 * `bookShipmentForOrder` validates for outbound shipments.
 */
export async function bookReturnPickup(
  db: SupabaseClient,
  provider: CourierProvider,
  returnId: string,
): Promise<ShipmentRecord> {
  const { data: returnRow, error: returnError } = await db
    .from('returns')
    .select('id, order_id, status')
    .eq('id', returnId)
    .maybeSingle()
  if (returnError) throw returnError
  if (!returnRow) throw new NotFoundError('Return')
  const returnRecord = returnRow as ReturnForPickupRow

  if (returnRecord.status !== 'approved') {
    throw new ValidationError(
      `Return "${returnId}" must be "approved" before a courier pickup can be booked (current status: "${returnRecord.status}").`,
    )
  }

  const { data: orderRow, error: orderError } = await db
    .from('orders')
    .select(ORDER_FOR_BOOKING_COLUMNS)
    .eq('id', returnRecord.order_id)
    .maybeSingle()
  if (orderError) throw orderError
  if (!orderRow) throw new NotFoundError('Order')
  const order = orderRow as OrderForBookingRow
  validateConsignee(order)

  const { data: existing, error: existingError } = await db
    .from('shipments')
    .select(SHIPMENT_COLUMNS)
    .eq('return_id', returnId)
    .eq('purpose', 'return')
    .neq('status', 'cancelled')
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return mapShipment(existing as ShipmentRow)

  const input: BookReturnPickupInput = {
    returnId,
    orderId: order.id,
    recipientName: order.shipping_recipient_name as string,
    recipientPhone: order.shipping_phone as string,
    addressLine1: order.shipping_address_line_1 as string,
    addressLine2: order.shipping_address_line_2 ?? undefined,
    city: order.shipping_city as string,
    province: order.shipping_province ?? undefined,
    postalCode: order.shipping_postal_code ?? undefined,
  }
  const requestPayload = buildSanitizedRequestPayload(
    { ...input, orderId: order.id },
    order.order_number,
    order.currency,
  )

  const { data: inserted, error: insertError } = await db
    .from('shipments')
    .insert({
      order_id: order.id,
      return_id: returnId,
      purpose: 'return',
      provider: 'leopards',
      status: 'pending_booking',
      request_payload: requestPayload,
    })
    .select(SHIPMENT_COLUMNS)
    .single()
  if (insertError) throw insertError
  const shipment = mapShipment(inserted as ShipmentRow)

  await db.from('shipment_events').insert({
    shipment_id: shipment.id,
    provider: 'leopards',
    event_type: 'return_pickup_booking_attempted',
    status: 'pending_booking',
    raw_payload: requestPayload,
  })

  try {
    const result = await provider.bookReturnPickup(input)
    const { data: updated, error: updateError } = await db
      .from('shipments')
      .update({
        tracking_number: result.trackingNumber,
        awb_number: result.awbNumber ?? null,
        status: result.status === 'pickup_requested' ? 'pickup_requested' : 'pending',
        provider_payload: result,
        booking_error: null,
        booking_attempted_at: new Date().toISOString(),
      })
      .eq('id', shipment.id)
      .select(SHIPMENT_COLUMNS)
      .single()
    if (updateError) throw updateError
    return mapShipment(updated as ShipmentRow)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .from('shipments')
      .update({ booking_error: message, booking_attempted_at: new Date().toISOString() })
      .eq('id', shipment.id)
    await db.from('shipment_events').insert({
      shipment_id: shipment.id,
      provider: 'leopards',
      event_type: 'return_pickup_booking_failed',
      status: 'pending_booking',
      raw_payload: { error: message },
    })
    throw err
  }
}

export async function getShipmentOrThrow(db: SupabaseClient, shipmentId: string): Promise<ShipmentRecord> {
  const { data, error } = await db.from('shipments').select(SHIPMENT_COLUMNS).eq('id', shipmentId).maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Shipment')
  return mapShipment(data as ShipmentRow)
}
