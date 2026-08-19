import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { CourierProvider, TrackShipmentResult } from '../../../lib/providers/CourierProvider'
import { ValidationError } from '../../../lib/errors'
import { getOrderTrackingTimeline, syncShipmentStatus } from './tracking.service'
import { FakeSupabaseClient } from './testUtils'

const ORDER_ID = 'order-1'
const SHIPMENT_ID = 'shipment-1'

function seedBookedShipment(db: FakeSupabaseClient, status = 'in_transit') {
  db.seed('shipments', [
    {
      id: SHIPMENT_ID,
      order_id: ORDER_ID,
      return_id: null,
      purpose: 'outbound',
      provider: 'leopards',
      tracking_number: 'LP123456',
      awb_number: 'AWB123456',
      status,
      booking_error: null,
      created_at: new Date('2026-08-01T08:00:00.000Z').toISOString(),
    },
  ])
}

/**
 * A FIXTURE mock CourierProvider — constructed by us for this test, NOT a
 * real Leopards API sample (none exists). Only trackShipment is exercised;
 * this is the sanctioned way to test the normalization layer's real logic
 * without live courier data (see docs/phase-11-completion-report.md).
 */
function fixtureProvider(trackResult: TrackShipmentResult): CourierProvider {
  return {
    name: 'Leopards Courier (fixture)',
    createShipment: async () => {
      throw new Error('not used in this test')
    },
    trackShipment: async () => trackResult,
    cancelShipment: async () => {},
    requestPickup: async () => ({ status: 'pickup_requested' as const }),
    bookReturnPickup: async () => {
      throw new Error('not used in this test')
    },
  }
}

describe('syncShipmentStatus', () => {
  it('refuses to sync a shipment that was never booked with a courier', async () => {
    const db = new FakeSupabaseClient()
    db.seed('shipments', [
      {
        id: SHIPMENT_ID,
        order_id: ORDER_ID,
        return_id: null,
        purpose: 'outbound',
        provider: 'leopards',
        tracking_number: null,
        awb_number: null,
        status: 'pending_booking',
        booking_error: 'not configured',
        created_at: new Date().toISOString(),
      },
    ])
    await expect(
      syncShipmentStatus(db as unknown as SupabaseClient, fixtureProvider({ trackingNumber: 'x', status: 'in_transit', lastUpdatedAt: new Date().toISOString() }), SHIPMENT_ID),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('applies a valid forward status transition from a fixture provider response', async () => {
    const db = new FakeSupabaseClient()
    seedBookedShipment(db, 'picked_up')

    const updated = await syncShipmentStatus(
      db as unknown as SupabaseClient,
      fixtureProvider({ trackingNumber: 'LP123456', status: 'in_transit', lastUpdatedAt: '2026-08-02T10:00:00.000Z' }),
      SHIPMENT_ID,
    )

    expect(updated.status).toBe('in_transit')
    const events = db.getTable('shipment_events')
    expect(events.some((e) => e.event_type === 'tracking_sync' && e.status === 'in_transit')).toBe(true)
  })

  it('flags an RTO status for accounting review without touching inventory or guessing an amount', async () => {
    const db = new FakeSupabaseClient()
    seedBookedShipment(db, 'failed_delivery')

    await syncShipmentStatus(
      db as unknown as SupabaseClient,
      fixtureProvider({ trackingNumber: 'LP123456', status: 'RTO Initiated', lastUpdatedAt: '2026-08-03T10:00:00.000Z' }),
      SHIPMENT_ID,
    )

    const shipment = db.getTable('shipments').find((s) => s.id === SHIPMENT_ID)!
    expect(shipment.status).toBe('rto_initiated')

    const reviewEntries = db.getTable('local_financial_transactions')
    expect(reviewEntries).toHaveLength(1)
    expect(reviewEntries[0]!.transaction_type).toBe('adjustment')
    expect(reviewEntries[0]!.amount).toBe(0) // never guesses a financial amount
    expect(String(reviewEntries[0]!.description)).toContain('rto_initiated')

    // Explicitly nothing written to any inventory-shaped table by this path.
    expect(db.getTable('inventory_cache')).toHaveLength(0)
  })

  it('ignores an unrecognized raw status without applying any change', async () => {
    const db = new FakeSupabaseClient()
    seedBookedShipment(db, 'in_transit')

    const result = await syncShipmentStatus(
      db as unknown as SupabaseClient,
      fixtureProvider({ trackingNumber: 'LP123456', status: 'some-brand-new-status', lastUpdatedAt: '2026-08-02T10:00:00.000Z' }),
      SHIPMENT_ID,
    )
    expect(result.status).toBe('in_transit')
  })
})

describe('getOrderTrackingTimeline', () => {
  it('builds a customer-safe timeline from shipment_events, excluding raw provider payloads', async () => {
    const db = new FakeSupabaseClient()
    seedBookedShipment(db, 'in_transit')
    db.seed('shipment_events', [
      { id: 'e1', shipment_id: SHIPMENT_ID, event_type: 'booking_attempted', status: 'pending_booking', created_at: '2026-08-01T08:00:00.000Z', raw_payload: { secret: 'internal' } },
      { id: 'e2', shipment_id: SHIPMENT_ID, event_type: 'tracking_sync', status: 'in_transit', created_at: '2026-08-02T08:00:00.000Z', raw_payload: { secret: 'internal' } },
    ])

    const timeline = await getOrderTrackingTimeline(db as unknown as SupabaseClient, ORDER_ID)
    expect(timeline.shipments).toHaveLength(1)
    expect(timeline.shipments[0]!.events).toHaveLength(2)
    expect(timeline.shipments[0]!.events[0]).not.toHaveProperty('rawPayload')
    expect(timeline.shipments[0]!.currentStatus).toBe('in_transit')
  })

  it('throws NotFoundError when the order has no shipments yet', async () => {
    const db = new FakeSupabaseClient()
    await expect(getOrderTrackingTimeline(db as unknown as SupabaseClient, 'no-shipments-order')).rejects.toThrow()
  })
})
