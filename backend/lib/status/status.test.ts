import { describe, expect, it } from 'vitest'
import {
  assertOrderStatusTransition,
  canTransitionOrderStatus,
  InvalidStatusTransitionError,
  isFulfillmentStatus,
  isOrderStatus,
  isPaymentStatus,
} from './index'

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
