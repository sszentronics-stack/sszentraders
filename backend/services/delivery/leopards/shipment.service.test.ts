import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { LeopardsCourierProvider } from '../../../lib/providers/leopards/LeopardsCourierProvider.ts'
import { IntegrationNotConfiguredError } from '../../../lib/providers/errors.ts'
import { ValidationError } from '../../../lib/errors/index.ts'
import { bookShipmentForOrder, cancelShipment } from './shipment.service.ts'
import { FakeSupabaseClient } from './testUtils.ts'

const ORDER_ID = 'order-1'

function seedOrder(db: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  db.seed('orders', [
    {
      id: ORDER_ID,
      order_number: 'AURA-20260819-ABC123',
      order_status: 'packed',
      payment_method: 'cod',
      grand_total: 50000,
      currency: 'PKR',
      shipping_recipient_name: 'Ayesha Khan',
      shipping_phone: '03001234567',
      shipping_address_line_1: 'House 12, Street 4',
      shipping_address_line_2: null,
      shipping_city: 'Lahore',
      shipping_province: 'Punjab',
      shipping_postal_code: '54000',
      ...overrides,
    },
  ])
}

// LeopardsCourierProvider(null) is the REAL Phase 1 skeleton (not a test
// double) — using it directly proves bookShipmentForOrder never fabricates
// a successful booking, exactly as the "never fake a success response" rule
// requires.
function notConfiguredProvider() {
  return new LeopardsCourierProvider(null)
}

describe('bookShipmentForOrder', () => {
  it('validates the order status is packed/ready before booking', async () => {
    const db = new FakeSupabaseClient()
    seedOrder(db, { order_status: 'confirmed' })
    await expect(
      bookShipmentForOrder(db as unknown as SupabaseClient, notConfiguredProvider(), ORDER_ID),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(db.getTable('shipments')).toHaveLength(0)
  })

  it('validates required consignee fields are present on the order', async () => {
    const db = new FakeSupabaseClient()
    seedOrder(db, { shipping_phone: null })
    await expect(
      bookShipmentForOrder(db as unknown as SupabaseClient, notConfiguredProvider(), ORDER_ID),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(db.getTable('shipments')).toHaveLength(0)
  })

  it('creates a pending_booking shipment row and surfaces IntegrationNotConfiguredError rather than crashing or faking success', async () => {
    const db = new FakeSupabaseClient()
    seedOrder(db)

    await expect(
      bookShipmentForOrder(db as unknown as SupabaseClient, notConfiguredProvider(), ORDER_ID),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)

    const shipments = db.getTable('shipments')
    expect(shipments).toHaveLength(1)
    expect(shipments[0]).toMatchObject({
      order_id: ORDER_ID,
      purpose: 'outbound',
      status: 'pending_booking',
    })
    expect(shipments[0]!.tracking_number).toBeUndefined()
    expect(shipments[0]!.booking_error).toContain('not configured')

    const events = db.getTable('shipment_events')
    expect(events.some((e) => e.event_type === 'booking_attempted')).toBe(true)
    expect(events.some((e) => e.event_type === 'booking_failed')).toBe(true)
  })

  it('maps COD amount onto the shipment request payload only for COD orders', async () => {
    const db = new FakeSupabaseClient()
    seedOrder(db, { payment_method: 'cod', grand_total: 75000 })
    await expect(
      bookShipmentForOrder(db as unknown as SupabaseClient, notConfiguredProvider(), ORDER_ID),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    const shipment = db.getTable('shipments')[0]!
    expect((shipment.request_payload as Record<string, unknown>).codAmount).toBe(75000)
  })

  it('does not set a COD amount for a non-COD order (never conflates "shipped" with "paid")', async () => {
    const db = new FakeSupabaseClient()
    seedOrder(db, { payment_method: 'easypaisa', grand_total: 30000 })
    await expect(
      bookShipmentForOrder(db as unknown as SupabaseClient, notConfiguredProvider(), ORDER_ID),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    const shipment = db.getTable('shipments')[0]!
    expect((shipment.request_payload as Record<string, unknown>).codAmount).toBeNull()
  })

  it('prevents duplicate booking: a second call for the same order reuses the existing shipment row and does not call the provider again', async () => {
    const db = new FakeSupabaseClient()
    seedOrder(db)
    const provider = notConfiguredProvider()
    const createSpy = vi.spyOn(provider, 'createShipment')

    await expect(bookShipmentForOrder(db as unknown as SupabaseClient, provider, ORDER_ID)).rejects.toBeInstanceOf(
      IntegrationNotConfiguredError,
    )
    expect(db.getTable('shipments')).toHaveLength(1)
    expect(createSpy).toHaveBeenCalledTimes(1)

    // Second attempt: the existing (still pending_booking, not cancelled)
    // shipment is returned as-is — no second row, no second provider call.
    const result = await bookShipmentForOrder(db as unknown as SupabaseClient, provider, ORDER_ID)
    expect(db.getTable('shipments')).toHaveLength(1)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('pending_booking')
  })
})

describe('cancelShipment', () => {
  it('cancels a not-yet-booked shipment locally without calling the provider (nothing courier-side to cancel)', async () => {
    const db = new FakeSupabaseClient()
    db.seed('shipments', [
      {
        id: 'shipment-1',
        order_id: ORDER_ID,
        return_id: null,
        purpose: 'outbound',
        provider: 'leopards',
        tracking_number: null,
        awb_number: null,
        status: 'pending_booking',
        booking_error: 'Leopards Courier integration is not configured.',
        created_at: new Date().toISOString(),
      },
    ])
    const provider = notConfiguredProvider()
    const cancelSpy = vi.spyOn(provider, 'cancelShipment')

    const result = await cancelShipment(db as unknown as SupabaseClient, provider, 'shipment-1', 'customer requested')
    expect(result.status).toBe('cancelled')
    expect(cancelSpy).not.toHaveBeenCalled()
  })

  it('rejects cancelling an already-delivered shipment', async () => {
    const db = new FakeSupabaseClient()
    db.seed('shipments', [
      {
        id: 'shipment-2',
        order_id: ORDER_ID,
        return_id: null,
        purpose: 'outbound',
        provider: 'leopards',
        tracking_number: 'LP999',
        awb_number: 'AWB999',
        status: 'delivered',
        booking_error: null,
        created_at: new Date().toISOString(),
      },
    ])
    await expect(
      cancelShipment(db as unknown as SupabaseClient, notConfiguredProvider(), 'shipment-2'),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
