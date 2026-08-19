/**
 * Pure commerce-analytics arithmetic — Phase 15 (ERP Reporting & Commerce
 * Analytics). Every function here is a plain, side-effect-free calculation
 * over numbers already fetched by the caller (an admin repository) — no
 * Supabase client, no I/O. Kept separate from the DB orchestration so the
 * arithmetic itself is unit-testable without a live database, matching the
 * pattern used by backend/lib/money and backend/lib/erp.
 *
 * IMPORTANT — labeling: everything computed here is "commerce analytics"
 * derived from Aura's own operational data (orders/carts/returns). None of
 * it is, or should ever be presented as, "ERP actuals" / authoritative
 * accounting figures. See docs/phase-15-completion-report.md for the exact
 * definition of every metric.
 */

/** Safe ratio: null (not NaN/Infinity) when the denominator is zero or negative — callers render this as "not enough data" rather than a bogus 0% or Infinity%. */
function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
  return numerator / denominator
}

export interface OrderForAov {
  grandTotal: number // minor units
}

/**
 * AOV = sum(order.grand_total) / count(orders), minor units, over whatever
 * set of orders the caller already filtered (this phase's convention:
 * order_status != 'cancelled', within the selected date range). Returns
 * null (not 0) when there are no orders, so the UI can show "no orders in
 * range" instead of a misleading Rs. 0 average.
 */
export function computeAverageOrderValue(orders: readonly OrderForAov[]): number | null {
  if (orders.length === 0) return null
  const total = orders.reduce((sum, o) => sum + o.grandTotal, 0)
  return Math.round(total / orders.length)
}

/**
 * Return rate (proxy) = count(return requests created in range) /
 * count(non-cancelled orders placed in range). A proxy because the returns
 * counted may belong to orders placed outside the selected range (a return
 * can be filed weeks after the order) — documented limitation, not a
 * perfectly matched cohort rate.
 */
export function computeReturnRate(returnCount: number, orderCount: number): number | null {
  return safeRatio(returnCount, orderCount)
}

/**
 * Abandoned-cart rate (proxy) = abandoned carts (a live snapshot: active
 * carts with items untouched for >= N days, as of now) / (abandoned carts +
 * orders placed in the selected range). This deliberately mixes a
 * point-in-time snapshot with a range-scoped count — it is a rough
 * operational signal ("how much of recent shopping activity is stalling
 * out"), not a true funnel conversion rate, and is documented as such.
 */
export function computeAbandonedCartRate(abandonedCartCount: number, orderCount: number): number | null {
  return safeRatio(abandonedCartCount, abandonedCartCount + orderCount)
}

/**
 * Returning-customer rate = count(customers who ordered in the selected
 * range AND have more than one non-cancelled order in their full history) /
 * count(distinct customers who ordered in the selected range). Guest
 * checkouts (no customer_id) are excluded from both sides. Reuses Phase
 * 13's segmentation status vocabulary (`COMPLETED_ORDER_STATUSES`) for what
 * counts as a real order.
 */
export function computeReturningCustomerRate(returningCustomerCount: number, totalCustomerCount: number): number | null {
  return safeRatio(returningCustomerCount, totalCustomerCount)
}

/**
 * Order-conversion proxy = count(orders placed in range) / count(carts
 * created in range). Not a true session-to-purchase conversion rate (no
 * page-view/session analytics exist in this project) — a rough
 * "how many shopping carts turn into an order" signal only.
 */
export function computeOrderConversionProxy(orderCount: number, cartCount: number): number | null {
  return safeRatio(orderCount, cartCount)
}

/**
 * CLV proxy for one customer = sum of that customer's non-cancelled order
 * grand_totals (minor units), all-time. Explicitly a proxy, not a full
 * lifetime-value model: it ignores cost of goods, acquisition cost,
 * discounting/time-value, and predicted future orders — it is simply
 * "how much has this customer paid us so far."
 */
export function computeCustomerLifetimeValueProxy(orderTotals: readonly number[]): number {
  return orderTotals.reduce((sum, t) => sum + t, 0)
}

/** Average CLV proxy across a set of customers (each entry = one customer's computeCustomerLifetimeValueProxy() result). Null when there are no customers. */
export function computeAverageClvProxy(perCustomerClvProxies: readonly number[]): number | null {
  if (perCustomerClvProxies.length === 0) return null
  const total = perCustomerClvProxies.reduce((sum, v) => sum + v, 0)
  return Math.round(total / perCustomerClvProxies.length)
}
