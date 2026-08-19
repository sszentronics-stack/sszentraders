/**
 * Money helpers — single authoritative implementation of the "minor units"
 * money convention documented in supabase/migrations/0001_extensions_and_enums.sql.
 *
 * Every monetary amount in the database and in service/repository code is a
 * BIGINT of minor units (e.g. PKR paisa, 1 PKR = 100 paisa). We never use
 * floating point for money. These helpers are the only place that convert
 * between major units (what a human types/reads) and minor units (what is
 * stored/computed).
 *
 * Reused as-is by both the Vite frontend (via src/lib) and Supabase Edge
 * Functions (via relative import) — do not fork a second copy.
 */

export const MINOR_UNITS_PER_MAJOR_UNIT = 100

export class InvalidMoneyInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidMoneyInputError'
  }
}

/** Convert a major-unit amount (e.g. 129 PKR) to minor units (12900 paisa). */
export function toMinorUnits(majorAmount: number): number {
  if (!Number.isFinite(majorAmount)) {
    throw new InvalidMoneyInputError(`Amount must be a finite number, got: ${majorAmount}`)
  }
  return Math.round(majorAmount * MINOR_UNITS_PER_MAJOR_UNIT)
}

/** Convert a minor-unit integer amount (e.g. 12900 paisa) to major units (129). */
export function toMajorUnits(minorAmount: number): number {
  if (!Number.isInteger(minorAmount)) {
    throw new InvalidMoneyInputError(`Minor unit amount must be an integer, got: ${minorAmount}`)
  }
  return minorAmount / MINOR_UNITS_PER_MAJOR_UNIT
}

export interface FormatMoneyOptions {
  currency?: string
  locale?: string
}

/** Format a minor-unit integer amount for display, e.g. 12900 -> "Rs.129". */
export function formatMoney(minorAmount: number, options: FormatMoneyOptions = {}): string {
  const { currency = 'PKR', locale = 'en-US' } = options
  const major = toMajorUnits(minorAmount)
  const symbol = currency === 'PKR' ? 'Rs.' : `${currency} `
  return `${symbol}${major.toLocaleString(locale)}`
}

/** Sum a list of minor-unit amounts safely (integer arithmetic only). */
export function sumMinorUnits(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => {
    if (!Number.isInteger(amount)) {
      throw new InvalidMoneyInputError(`All amounts must be integers, got: ${amount}`)
    }
    return total + amount
  }, 0)
}

export interface OrderLineInput {
  unitPrice: number // minor units
  quantity: number
  discountAmount?: number // minor units
}

/** Compute a line total (unitPrice * quantity - discount), all minor units. */
export function calculateLineTotal(line: OrderLineInput): number {
  if (line.quantity <= 0 || !Number.isInteger(line.quantity)) {
    throw new InvalidMoneyInputError(`Quantity must be a positive integer, got: ${line.quantity}`)
  }
  const discount = line.discountAmount ?? 0
  const total = line.unitPrice * line.quantity - discount
  if (total < 0) {
    throw new InvalidMoneyInputError('Line total cannot be negative')
  }
  return total
}

export interface OrderTotalsInput {
  subtotal: number
  discountTotal?: number
  shippingTotal?: number
  taxTotal?: number
}

export interface OrderTotals {
  subtotal: number
  discountTotal: number
  shippingTotal: number
  taxTotal: number
  grandTotal: number
}

/** Compute grand total from an order's component minor-unit amounts. */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  const discountTotal = input.discountTotal ?? 0
  const shippingTotal = input.shippingTotal ?? 0
  const taxTotal = input.taxTotal ?? 0
  const grandTotal = input.subtotal - discountTotal + shippingTotal + taxTotal
  if (grandTotal < 0) {
    throw new InvalidMoneyInputError('Grand total cannot be negative')
  }
  return {
    subtotal: input.subtotal,
    discountTotal,
    shippingTotal,
    taxTotal,
    grandTotal,
  }
}
