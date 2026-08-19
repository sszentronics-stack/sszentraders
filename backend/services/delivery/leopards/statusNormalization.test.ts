import { describe, expect, it } from 'vitest'
import {
  canTransitionShipmentStatus,
  genericStateToShipmentStatus,
  isShipmentStatus,
  normalizeRawCourierStatus,
  requiresAccountingReview,
  resolveShipmentStatusUpdate,
} from './statusNormalization'

// These are FIXTURES we constructed ourselves to exercise the normalization
// logic — not real Leopards API sample payloads (none are available).
describe('normalizeRawCourierStatus', () => {
  it('maps known raw courier status strings (case/whitespace/casing tolerant)', () => {
    expect(normalizeRawCourierStatus('Booked')).toBe('booked')
    expect(normalizeRawCourierStatus('picked up')).toBe('picked_up')
    expect(normalizeRawCourierStatus('IN_TRANSIT')).toBe('in_transit')
    expect(normalizeRawCourierStatus('Out For Delivery')).toBe('out_for_delivery')
    expect(normalizeRawCourierStatus('Delivered')).toBe('delivered')
    expect(normalizeRawCourierStatus('Delivery Failed')).toBe('failed_delivery')
    expect(normalizeRawCourierStatus('RTO Initiated')).toBe('rto_initiated')
    expect(normalizeRawCourierStatus('RTO In Transit')).toBe('rto_in_transit')
    expect(normalizeRawCourierStatus('RTO Delivered')).toBe('rto_delivered')
    expect(normalizeRawCourierStatus('Cancelled')).toBe('cancelled')
    expect(normalizeRawCourierStatus('Canceled')).toBe('cancelled')
  })

  it('returns null for an unrecognized raw status rather than guessing', () => {
    expect(normalizeRawCourierStatus('some-future-leopards-status')).toBeNull()
  })
})

describe('genericStateToShipmentStatus', () => {
  it('maps every generic state to a valid Aura shipment status', () => {
    expect(isShipmentStatus(genericStateToShipmentStatus('booked'))).toBe(true)
    expect(genericStateToShipmentStatus('rto_delivered')).toBe('rto_delivered')
  })
})

describe('canTransitionShipmentStatus', () => {
  it('allows the documented forward transitions', () => {
    expect(canTransitionShipmentStatus('pending_booking', 'pending')).toBe(true)
    expect(canTransitionShipmentStatus('pending', 'picked_up')).toBe(true)
    expect(canTransitionShipmentStatus('in_transit', 'out_for_delivery')).toBe(true)
    expect(canTransitionShipmentStatus('out_for_delivery', 'delivered')).toBe(true)
    expect(canTransitionShipmentStatus('failed_delivery', 'rto_initiated')).toBe(true)
    expect(canTransitionShipmentStatus('failed_delivery', 'in_transit')).toBe(true)
    expect(canTransitionShipmentStatus('rto_initiated', 'rto_in_transit')).toBe(true)
    expect(canTransitionShipmentStatus('rto_in_transit', 'rto_delivered')).toBe(true)
  })

  it('rejects transitions that skip states or move out of a terminal status', () => {
    expect(canTransitionShipmentStatus('pending_booking', 'delivered')).toBe(false)
    expect(canTransitionShipmentStatus('delivered', 'in_transit')).toBe(false)
    expect(canTransitionShipmentStatus('cancelled', 'pending')).toBe(false)
    expect(canTransitionShipmentStatus('rto_delivered', 'rto_initiated')).toBe(false)
  })

  it('treats re-applying the same status as a no-op-allowed idempotent case', () => {
    expect(canTransitionShipmentStatus('in_transit', 'in_transit')).toBe(true)
  })
})

describe('resolveShipmentStatusUpdate', () => {
  it('applies a valid forward transition', () => {
    const decision = resolveShipmentStatusUpdate({
      currentStatus: 'pending',
      lastEventAt: '2026-08-01T10:00:00.000Z',
      rawStatus: 'picked_up',
      eventAt: '2026-08-01T11:00:00.000Z',
    })
    expect(decision.action).toBe('apply')
    if (decision.action === 'apply') {
      expect(decision.normalizedStatus).toBe('picked_up')
      expect(decision.genericState).toBe('picked_up')
    }
  })

  it('ignores an unrecognized raw status without applying anything', () => {
    const decision = resolveShipmentStatusUpdate({
      currentStatus: 'in_transit',
      lastEventAt: null,
      rawStatus: 'teleported',
      eventAt: '2026-08-01T11:00:00.000Z',
    })
    expect(decision.action).toBe('ignore_unknown_status')
  })

  it('ignores a stale/out-of-order event older than the last applied event', () => {
    const decision = resolveShipmentStatusUpdate({
      currentStatus: 'in_transit',
      lastEventAt: '2026-08-05T09:00:00.000Z',
      rawStatus: 'picked_up',
      eventAt: '2026-08-01T11:00:00.000Z', // earlier than lastEventAt
    })
    expect(decision.action).toBe('ignore_stale_event')
  })

  it('ignores an update that would be an invalid transition (e.g. delivered -> in_transit)', () => {
    const decision = resolveShipmentStatusUpdate({
      currentStatus: 'delivered',
      lastEventAt: '2026-08-01T09:00:00.000Z',
      rawStatus: 'in_transit',
      eventAt: '2026-08-02T09:00:00.000Z',
    })
    expect(decision.action).toBe('ignore_invalid_transition')
  })

  it('allows re-delivering the same status idempotently (duplicate webhook)', () => {
    const decision = resolveShipmentStatusUpdate({
      currentStatus: 'out_for_delivery',
      lastEventAt: '2026-08-01T09:00:00.000Z',
      rawStatus: 'out_for_delivery',
      eventAt: '2026-08-01T09:05:00.000Z',
    })
    expect(decision.action).toBe('apply')
  })
})

describe('requiresAccountingReview', () => {
  it('flags failed delivery and every RTO stage for review', () => {
    expect(requiresAccountingReview('failed_delivery')).toBe(true)
    expect(requiresAccountingReview('rto_initiated')).toBe(true)
    expect(requiresAccountingReview('rto_in_transit')).toBe(true)
    expect(requiresAccountingReview('rto_delivered')).toBe(true)
  })

  it('does not flag normal in-flight or delivered statuses', () => {
    expect(requiresAccountingReview('in_transit')).toBe(false)
    expect(requiresAccountingReview('delivered')).toBe(false)
    expect(requiresAccountingReview('pending')).toBe(false)
  })
})
