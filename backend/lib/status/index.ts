/**
 * Status vocabularies and transition validation.
 *
 * These constants MUST stay in sync with the Postgres enums defined in
 * supabase/migrations/0001_extensions_and_enums.sql (order_status,
 * payment_status, fulfillment_status). A mismatch would let application
 * code accept a status Postgres will reject, or vice versa.
 */

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'ready_for_pickup',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
  'refunded',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const FULFILLMENT_STATUSES = [
  'unfulfilled',
  'partially_fulfilled',
  'fulfilled',
  'returned',
  'cancelled',
] as const

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value)
}

export function isFulfillmentStatus(value: string): value is FulfillmentStatus {
  return (FULFILLMENT_STATUSES as readonly string[]).includes(value)
}

/**
 * Allowed forward transitions for orders. Terminal states (cancelled,
 * refunded) have no outgoing transitions. `returned` can move to `refunded`.
 * This is intentionally conservative for Phase 1 — later phases (Checkout &
 * Order Management, Returns) may extend it, but should not remove the
 * historical-integrity guarantee that an order never silently jumps states.
 */
const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: ['refunded'],
  refunded: [],
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Invalid order status transition: "${from}" -> "${to}"`)
    this.name = 'InvalidStatusTransitionError'
  }
}

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

export function assertOrderStatusTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrderStatus(from, to)) {
    throw new InvalidStatusTransitionError(from, to)
  }
}
