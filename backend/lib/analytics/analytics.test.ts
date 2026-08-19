import { describe, expect, it } from 'vitest'
import {
  computeAbandonedCartRate,
  computeAverageClvProxy,
  computeAverageOrderValue,
  computeCustomerLifetimeValueProxy,
  computeOrderConversionProxy,
  computeReturnRate,
  computeReturningCustomerRate,
} from './index.ts'

describe('computeAverageOrderValue', () => {
  it('averages grand totals in minor units', () => {
    expect(computeAverageOrderValue([{ grandTotal: 10_000 }, { grandTotal: 20_000 }, { grandTotal: 30_000 }])).toBe(20_000)
  })

  it('rounds to the nearest minor unit', () => {
    expect(computeAverageOrderValue([{ grandTotal: 10_000 }, { grandTotal: 10_001 }])).toBe(10_001) // 10000.5 -> rounds up
  })

  it('returns null (not 0) for an empty order set', () => {
    expect(computeAverageOrderValue([])).toBeNull()
  })
})

describe('computeReturnRate', () => {
  it('divides returns by orders', () => {
    expect(computeReturnRate(2, 10)).toBe(0.2)
  })

  it('returns null when there are no orders, instead of Infinity/NaN', () => {
    expect(computeReturnRate(2, 0)).toBeNull()
  })

  it('returns 0 (not null) when there are orders but no returns', () => {
    expect(computeReturnRate(0, 10)).toBe(0)
  })
})

describe('computeAbandonedCartRate', () => {
  it('divides abandoned carts by (abandoned + orders)', () => {
    expect(computeAbandonedCartRate(5, 15)).toBe(0.25)
  })

  it('returns null when both abandoned carts and orders are zero', () => {
    expect(computeAbandonedCartRate(0, 0)).toBeNull()
  })
})

describe('computeReturningCustomerRate', () => {
  it('divides returning customers by total customers who ordered', () => {
    expect(computeReturningCustomerRate(3, 12)).toBe(0.25)
  })

  it('returns null with zero total customers', () => {
    expect(computeReturningCustomerRate(0, 0)).toBeNull()
  })
})

describe('computeOrderConversionProxy', () => {
  it('divides orders by carts', () => {
    expect(computeOrderConversionProxy(4, 20)).toBe(0.2)
  })

  it('returns null when no carts were created', () => {
    expect(computeOrderConversionProxy(4, 0)).toBeNull()
  })
})

describe('CLV proxy', () => {
  it('sums one customer\'s order totals', () => {
    expect(computeCustomerLifetimeValueProxy([10_000, 25_000, 15_000])).toBe(50_000)
  })

  it('sums to 0 for a customer with no orders', () => {
    expect(computeCustomerLifetimeValueProxy([])).toBe(0)
  })

  it('averages per-customer CLV proxies', () => {
    expect(computeAverageClvProxy([50_000, 30_000, 10_000])).toBe(30_000)
  })

  it('returns null average CLV with no customers', () => {
    expect(computeAverageClvProxy([])).toBeNull()
  })
})
