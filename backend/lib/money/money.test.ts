import { describe, expect, it } from 'vitest'
import {
  calculateLineTotal,
  calculateOrderTotals,
  formatMoney,
  InvalidMoneyInputError,
  sumMinorUnits,
  toMajorUnits,
  toMinorUnits,
} from './index.ts'

describe('money helpers', () => {
  it('converts major units to minor units', () => {
    expect(toMinorUnits(129)).toBe(12900)
    expect(toMinorUnits(129.5)).toBe(12950)
  })

  it('converts minor units back to major units', () => {
    expect(toMajorUnits(12900)).toBe(129)
  })

  it('rejects non-integer minor unit amounts', () => {
    expect(() => toMajorUnits(129.5)).toThrow(InvalidMoneyInputError)
  })

  it('formats PKR amounts with the Rs. prefix', () => {
    expect(formatMoney(12900)).toBe('Rs.129')
    expect(formatMoney(440000)).toBe('Rs.4,400')
  })

  it('sums minor unit amounts', () => {
    expect(sumMinorUnits([12900, 440000, 79000])).toBe(531900)
  })

  it('rejects non-integer amounts when summing', () => {
    expect(() => sumMinorUnits([12900, 10.5])).toThrow(InvalidMoneyInputError)
  })

  it('calculates a line total', () => {
    expect(calculateLineTotal({ unitPrice: 12900, quantity: 2 })).toBe(25800)
    expect(calculateLineTotal({ unitPrice: 12900, quantity: 2, discountAmount: 1000 })).toBe(24800)
  })

  it('rejects a line total that would go negative', () => {
    expect(() => calculateLineTotal({ unitPrice: 100, quantity: 1, discountAmount: 200 })).toThrow(
      InvalidMoneyInputError,
    )
  })

  it('calculates order totals', () => {
    const totals = calculateOrderTotals({
      subtotal: 25800,
      discountTotal: 1000,
      shippingTotal: 20000,
      taxTotal: 0,
    })
    expect(totals.grandTotal).toBe(44800)
  })
})
