/**
 * Pure order domain rules — order number generation, order-item snapshot
 * construction from a (server-revalidated) cart, and delivery-cost lookup.
 * Nothing here touches a database (that's
 * backend/services/orders/orders.service.ts); unit-testable without a live
 * Supabase project, same pattern as backend/lib/catalog and
 * backend/lib/cart. Status transition rules already exist and are reused
 * as-is from backend/lib/status (ORDER_STATUSES, assertOrderStatusTransition)
 * — not re-derived here.
 */
import { calculateLineTotal } from '../money/index.ts'

function datePart(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * A human-friendly, collision-resistant order number candidate:
 * `AURA-YYYYMMDD-XXXXXX`. Actual uniqueness is enforced by the database
 * unique index on `orders.order_number` (0006_orders.sql) —
 * generateUniqueOrderNumber below is the retry loop that finds a free one,
 * the exact same shape backend/lib/slug's generateUniqueSlug uses for
 * product slugs.
 */
export function orderNumberCandidate(date: Date, randomSuffix: string): string {
  return `AURA-${datePart(date)}-${randomSuffix.toUpperCase()}`
}

export class OrderNumberExhaustedError extends Error {
  constructor(attempts: number) {
    super(`Could not generate a unique order number after ${attempts} attempts`)
    this.name = 'OrderNumberExhaustedError'
  }
}

const MAX_ORDER_NUMBER_ATTEMPTS = 20

/** Generate a unique order number, retrying with a fresh random suffix on collision. */
export async function generateUniqueOrderNumber(
  now: Date,
  randomSuffix: () => string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    const candidate = orderNumberCandidate(now, randomSuffix())
    if (!(await exists(candidate))) return candidate
  }
  throw new OrderNumberExhaustedError(MAX_ORDER_NUMBER_ATTEMPTS)
}

export interface CartLineForOrder {
  productId: string
  variantId: string
  sku: string
  productName: string
  variantTitle: string | null
  quantity: number
  unitPrice: number // minor units — the server-revalidated current price (see backend/lib/cart's revalidateCartLine)
  compareAtPrice: number | null
}

export interface OrderItemSnapshot {
  productId: string
  variantId: string
  sku: string
  productName: string
  variantName: string | null
  quantity: number
  unitPrice: number
  originalPrice: number | null
  discountAmount: number
  lineTotal: number
}

/**
 * Build immutable order_item snapshots from the already server-revalidated
 * cart lines at the moment of order creation — never re-derived from the
 * current catalog later. `originalPrice` is only set when there's a genuine
 * markdown to display (compareAtPrice > unitPrice); `discountAmount` stays 0
 * here because unitPrice is already the final sellable price — a coupon/
 * promotion system (Phase 13) would populate it, not this function.
 */
export function buildOrderItemSnapshots(lines: CartLineForOrder[]): OrderItemSnapshot[] {
  return lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    sku: line.sku,
    productName: line.productName,
    variantName: line.variantTitle,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    originalPrice: line.compareAtPrice && line.compareAtPrice > line.unitPrice ? line.compareAtPrice : null,
    discountAmount: 0,
    lineTotal: calculateLineTotal({ unitPrice: line.unitPrice, quantity: line.quantity }),
  }))
}

export type DeliveryMethod = 'standard' | 'express'

/**
 * Flat-rate placeholder delivery pricing (minor units) — there is no live
 * courier integration until Phase 11 (Leopards Courier Fulfilment), so this
 * is deliberately simple rather than inventing a rate table the business
 * hasn't actually set. Revisit once real service-level pricing exists.
 */
const DELIVERY_COSTS: Record<DeliveryMethod, number> = {
  standard: 20000, // Rs. 200
  express: 40000, // Rs. 400
}

export function deliveryCost(method: DeliveryMethod): number {
  return DELIVERY_COSTS[method]
}
