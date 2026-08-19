/**
 * Status vocabularies and transition validation.
 *
 * These constants MUST stay in sync with the Postgres enums defined in
 * supabase/migrations/0001_extensions_and_enums.sql (order_status,
 * payment_status, fulfillment_status, return_status). A mismatch would let
 * application code accept a status Postgres will reject, or vice versa.
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

// ---------------------------------------------------------------------------
// Phase 14 — Reviews, Returns & Customer Service
// ---------------------------------------------------------------------------

/** Matches the `return_status` Postgres enum (0001_extensions_and_enums.sql) — unchanged since Phase 1, no new migration values needed. */
export const RETURN_STATUSES = [
  'requested',
  'under_review',
  'approved',
  'rejected',
  'pickup_requested',
  'in_transit',
  'received',
  'refunded',
  'replaced',
  'closed',
] as const

export type ReturnStatus = (typeof RETURN_STATUSES)[number]

export function isReturnStatus(value: string): value is ReturnStatus {
  return (RETURN_STATUSES as readonly string[]).includes(value)
}

/**
 * Allowed forward transitions for the full return lifecycle: a customer
 * request is reviewed, approved/rejected, physically moves through courier
 * pickup (or a manual/drop-off path straight to `received`), gets inspected,
 * and resolves to a refund/replacement or a closed rejection. `closed` is
 * the only true terminal state — `refunded`/`replaced`/`rejected` can still
 * be closed out (e.g. after the customer is notified) but never re-opened.
 */
const RETURN_TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  requested: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['pickup_requested', 'received'],
  pickup_requested: ['in_transit', 'received'],
  in_transit: ['received'],
  received: ['refunded', 'replaced', 'closed'],
  refunded: ['closed'],
  replaced: ['closed'],
  rejected: ['closed'],
  closed: [],
}

export class InvalidReturnStatusTransitionError extends Error {
  constructor(from: ReturnStatus, to: ReturnStatus) {
    super(`Invalid return status transition: "${from}" -> "${to}"`)
    this.name = 'InvalidReturnStatusTransitionError'
  }
}

export function canTransitionReturnStatus(from: ReturnStatus, to: ReturnStatus): boolean {
  return RETURN_TRANSITIONS[from].includes(to)
}

export function assertReturnStatusTransition(from: ReturnStatus, to: ReturnStatus): void {
  if (!canTransitionReturnStatus(from, to)) {
    throw new InvalidReturnStatusTransitionError(from, to)
  }
}
