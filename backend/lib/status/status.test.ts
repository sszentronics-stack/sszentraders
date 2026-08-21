import { describe, expect, it } from 'vitest'
import {
  assertOrderStatusTransition,
  assertReturnStatusTransition,
  canTransitionOrderStatus,
  canTransitionReturnStatus,
  InvalidReturnStatusTransitionError,
  InvalidStatusTransitionError,
  isFulfillmentStatus,
  isOrderStatus,
  isPaymentStatus,
  isReturnStatus,
} from './index.ts'

describe('status validation', () => {
  it('recognizes valid order/payment/fulfillment statuses', () => {
    expect(isOrderStatus('pending')).toBe(true)
    expect(isOrderStatus('nope')).toBe(false)
    expect(isPaymentStatus('paid')).toBe(true)
    expect(isPaymentStatus('nope')).toBe(false)
    expect(isFulfillmentStatus('fulfilled')).toBe(true)
    expect(isFulfillmentStatus('nope')).toBe(false)
  })

  it('allows valid forward transitions', () => {
    expect(canTransitionOrderStatus('pending', 'confirmed')).toBe(true)
    expect(canTransitionOrderStatus('shipped', 'delivered')).toBe(true)
    expect(canTransitionOrderStatus('delivered', 'returned')).toBe(true)
  })

  it('rejects invalid or backward transitions', () => {
    expect(canTransitionOrderStatus('pending', 'delivered')).toBe(false)
    expect(canTransitionOrderStatus('delivered', 'pending')).toBe(false)
    expect(canTransitionOrderStatus('cancelled', 'confirmed')).toBe(false)
  })

  it('throws a clear error on an invalid transition', () => {
    expect(() => assertOrderStatusTransition('cancelled', 'confirmed')).toThrow(
      InvalidStatusTransitionError,
    )
  })

  it('terminal statuses have no outgoing transitions', () => {
    expect(canTransitionOrderStatus('cancelled', 'pending')).toBe(false)
    expect(canTransitionOrderStatus('refunded', 'pending')).toBe(false)
  })
})

describe('return status validation', () => {
  it('recognizes valid return statuses', () => {
    expect(isReturnStatus('requested')).toBe(true)
    expect(isReturnStatus('received')).toBe(true)
    expect(isReturnStatus('nope')).toBe(false)
  })

  it('allows the full happy-path lifecycle', () => {
    expect(canTransitionReturnStatus('requested', 'under_review')).toBe(true)
    expect(canTransitionReturnStatus('under_review', 'approved')).toBe(true)
    expect(canTransitionReturnStatus('approved', 'pickup_requested')).toBe(true)
    expect(canTransitionReturnStatus('pickup_requested', 'in_transit')).toBe(true)
    expect(canTransitionReturnStatus('in_transit', 'received')).toBe(true)
    expect(canTransitionReturnStatus('received', 'refunded')).toBe(true)
    expect(canTransitionReturnStatus('received', 'replaced')).toBe(true)
    expect(canTransitionReturnStatus('refunded', 'closed')).toBe(true)
  })

  it('allows a manual/drop-off path straight from approved to received', () => {
    expect(canTransitionReturnStatus('approved', 'received')).toBe(true)
  })

  it('allows rejection at requested or under_review, and closing a rejection', () => {
    expect(canTransitionReturnStatus('requested', 'rejected')).toBe(true)
    expect(canTransitionReturnStatus('under_review', 'rejected')).toBe(true)
    expect(canTransitionReturnStatus('rejected', 'closed')).toBe(true)
  })

  it('rejects invalid/backward transitions', () => {
    expect(canTransitionReturnStatus('requested', 'received')).toBe(false)
    expect(canTransitionReturnStatus('received', 'requested')).toBe(false)
    expect(canTransitionReturnStatus('closed', 'requested')).toBe(false)
  })

  it('closed is terminal with no outgoing transitions', () => {
    expect(canTransitionReturnStatus('closed', 'refunded')).toBe(false)
  })

  it('throws a clear error on an invalid return transition', () => {
    expect(() => assertReturnStatusTransition('closed', 'requested')).toThrow(InvalidReturnStatusTransitionError)
    expect(() => assertReturnStatusTransition('requested', 'under_review')).not.toThrow()
  })
})
