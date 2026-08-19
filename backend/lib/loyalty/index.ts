/**
 * Pure loyalty-points domain rules — earn rate, redemption value, balance
 * arithmetic. Nothing here touches a database (that's
 * backend/services/promotions/loyalty.service.ts); unit-testable without a
 * live Supabase project, same pattern as backend/lib/money and
 * backend/lib/orders.
 *
 * The ledger itself (loyalty_ledger_entries, 0022_promotions_engine.sql) is
 * append-only — a customer's balance is ALWAYS `sumLedgerBalance()` over
 * their entries, never a mutable "points" column anywhere. earn() credits
 * happen automatically via a DB trigger on `orders.order_status` reaching
 * 'delivered' (see the migration's header for why a trigger rather than a
 * service-layer call site) using the SAME rate defined here — if
 * EARN_RATE_PER_MINOR_UNIT ever changes, the trigger's hardcoded formula
 * must change with it (documented at both ends).
 */

/** 1 point earned per Rs. 1 (100 minor units) of grand_total, floored. */
export const EARN_RATE_MINOR_UNITS_PER_POINT = 100

/** 1 point redeemed is worth Rs. 1 (100 minor units) of discount. */
export const REDEMPTION_MINOR_UNITS_PER_POINT = 100

export interface LoyaltyLedgerEntryLike {
  points: number
}

/** Compute the points an order will earn once delivered, from its grand total (minor units). Mirrors the DB trigger's `floor(grand_total / 100.0)`. */
export function computeEarnedPoints(grandTotalMinorUnits: number): number {
  if (!Number.isFinite(grandTotalMinorUnits) || grandTotalMinorUnits < 0) return 0
  return Math.floor(grandTotalMinorUnits / EARN_RATE_MINOR_UNITS_PER_POINT)
}

/** Minor-unit discount value of redeeming `points` loyalty points. */
export function computeRedemptionValue(points: number): number {
  if (!Number.isInteger(points) || points <= 0) return 0
  return points * REDEMPTION_MINOR_UNITS_PER_POINT
}

/** Sum signed points across ledger entries — the one and only way a balance is ever computed. */
export function sumLedgerBalance(entries: readonly LoyaltyLedgerEntryLike[]): number {
  return entries.reduce((total, entry) => total + entry.points, 0)
}

export class InvalidRedemptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidRedemptionError'
  }
}

/**
 * How many points a customer may redeem right now, given their current
 * balance and the cart subtotal being discounted: never more than the
 * balance, never negative, and never worth more than the subtotal itself
 * (redemption discounts merchandise value — it should not, combined with
 * other discounts elsewhere, be able to push a line into being "worth"
 * more discount than the goods cost before shipping/tax).
 */
export function computeMaxRedeemablePoints(balance: number, subtotalMinorUnits: number): number {
  const affordableByBalance = Math.max(0, Math.floor(balance))
  const affordableBySubtotal = Math.max(0, Math.floor(subtotalMinorUnits / REDEMPTION_MINOR_UNITS_PER_POINT))
  return Math.min(affordableByBalance, affordableBySubtotal)
}

/**
 * Validate a requested redemption against balance/subtotal, throwing a
 * clear InvalidRedemptionError rather than letting a downstream money
 * helper reject with an opaque "cannot go negative" error.
 */
export function assertRedeemable(requestedPoints: number, balance: number, subtotalMinorUnits: number): void {
  if (!Number.isInteger(requestedPoints) || requestedPoints <= 0) {
    throw new InvalidRedemptionError('Points to redeem must be a positive whole number.')
  }
  const max = computeMaxRedeemablePoints(balance, subtotalMinorUnits)
  if (requestedPoints > max) {
    throw new InvalidRedemptionError(
      max === 0
        ? 'You have no redeemable loyalty points available for this order.'
        : `You can redeem at most ${max} points for this order.`,
    )
  }
}
