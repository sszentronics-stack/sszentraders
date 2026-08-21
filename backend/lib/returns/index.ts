/**
 * Pure return-policy domain rules — reason-code vocabulary, evidence
 * requirements, return-number generation, and the eligibility engine that
 * decides whether an order/order item can be returned. Nothing here touches
 * a database (that's backend/services/reviews/returns.service.ts);
 * unit-testable without a live Supabase project, same split as
 * backend/lib/orders vs backend/services/orders.
 *
 * This is deliberately a real, configurable policy engine — not an ad hoc
 * frontend "is this within N days" check. The frontend never decides
 * eligibility; it only reflects what this module (invoked server-side)
 * already decided, matching the "never trust the client for eligibility"
 * rule this codebase applies to price/availability elsewhere.
 */

export const RETURN_REASON_CODES = [
  'damaged_in_transit',
  'wrong_item_received',
  'not_as_described',
  'defective_quality',
  'changed_mind',
  'size_fit_issue',
  'other',
] as const

export type ReturnReasonCode = (typeof RETURN_REASON_CODES)[number]

export function isReturnReasonCode(value: string): value is ReturnReasonCode {
  return (RETURN_REASON_CODES as readonly string[]).includes(value)
}

export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
  damaged_in_transit: 'Arrived damaged',
  wrong_item_received: 'Received the wrong item',
  not_as_described: 'Not as described',
  defective_quality: 'Quality issue / defective',
  changed_mind: 'Changed my mind',
  size_fit_issue: 'Size or fit issue',
  other: 'Other',
}

/**
 * Reason codes that assert something went wrong with the item itself (as
 * opposed to a simple change of mind) require photo evidence before the
 * request can be reviewed — a real, server-enforced rule, not a UI nicety.
 * `changed_mind`/`size_fit_issue`/`other` do not require it, though a
 * customer may still attach evidence voluntarily.
 */
export const REASON_CODES_REQUIRING_EVIDENCE: ReadonlySet<ReturnReasonCode> = new Set([
  'damaged_in_transit',
  'wrong_item_received',
  'not_as_described',
  'defective_quality',
])

export function reasonRequiresEvidence(reasonCode: ReturnReasonCode): boolean {
  return REASON_CODES_REQUIRING_EVIDENCE.has(reasonCode)
}

/**
 * Configurable policy values — a real business would tune these per
 * catalog/region; kept as a single exported constant object (rather than
 * scattered magic numbers) so a future admin-configurable-policy phase has
 * one obvious place to source overrides from.
 */
export const RETURN_POLICY = {
  /** Days after delivery a return request can still be opened. */
  windowDays: 7,
} as const

function datePart(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

/** A human-friendly, collision-resistant return number candidate: `RET-YYYYMMDD-XXXXXX` — same shape as backend/lib/orders' orderNumberCandidate. */
export function returnNumberCandidate(date: Date, randomSuffix: string): string {
  return `RET-${datePart(date)}-${randomSuffix.toUpperCase()}`
}

export class ReturnNumberExhaustedError extends Error {
  constructor(attempts: number) {
    super(`Could not generate a unique return number after ${attempts} attempts`)
    this.name = 'ReturnNumberExhaustedError'
  }
}

const MAX_RETURN_NUMBER_ATTEMPTS = 20

/** Generate a unique return number, retrying with a fresh random suffix on collision — same shape as generateUniqueOrderNumber. */
export async function generateUniqueReturnNumber(
  now: Date,
  randomSuffix: () => string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETURN_NUMBER_ATTEMPTS; attempt++) {
    const candidate = returnNumberCandidate(now, randomSuffix())
    if (!(await exists(candidate))) return candidate
  }
  throw new ReturnNumberExhaustedError(MAX_RETURN_NUMBER_ATTEMPTS)
}

// ---------------------------------------------------------------------------
// Eligibility engine
// ---------------------------------------------------------------------------

export interface ReturnEligibilityOrderItem {
  orderItemId: string
  /** order_items.quantity — the total quantity originally purchased on this line. */
  purchasedQuantity: number
  /** Sum of quantities already requested across this order item's non-rejected/non-closed-without-resolution returns. */
  alreadyRequestedQuantity: number
}

export interface ReturnRequestLine {
  orderItemId: string
  quantity: number
  reasonCode: ReturnReasonCode
  hasEvidence: boolean
}

export interface ReturnEligibilityInput {
  orderStatus: string
  /** ISO timestamp the order was actually delivered — from the shipment record, not a guess. Null/undefined if never delivered. */
  deliveredAt: string | null | undefined
  now: Date
  /** The purchased line items on this order, keyed for lookup by the requested lines below. */
  orderItems: ReturnEligibilityOrderItem[]
  /** What the customer is asking to return right now. */
  requestedLines: ReturnRequestLine[]
}

export interface ReturnLineEligibility {
  orderItemId: string
  eligible: boolean
  reasons: string[]
}

export interface ReturnEligibilityResult {
  eligible: boolean
  /** Order-level reasons the whole request is blocked (e.g. order never delivered, outside the return window) — empty when only specific lines are the problem. */
  orderLevelReasons: string[]
  lines: ReturnLineEligibility[]
}

/**
 * Decide whether a return request is eligible, given already-known,
 * server-loaded facts (order status, real delivered timestamp, purchased
 * quantities, prior return requests). Pure and synchronous — the caller
 * (backend/services/reviews/returns.service.ts) is responsible for loading
 * all of this from the database first; this function never queries
 * anything itself, which is what makes it fully unit-testable.
 */
export function evaluateReturnEligibility(input: ReturnEligibilityInput): ReturnEligibilityResult {
  const orderLevelReasons: string[] = []

  if (input.orderStatus !== 'delivered') {
    orderLevelReasons.push(`Order must be delivered before a return can be requested (current status: "${input.orderStatus}").`)
  }

  let withinWindow = false
  if (input.deliveredAt) {
    const deliveredAt = new Date(input.deliveredAt)
    const deadline = new Date(deliveredAt.getTime() + RETURN_POLICY.windowDays * 24 * 60 * 60 * 1000)
    withinWindow = input.now.getTime() <= deadline.getTime()
    if (!withinWindow) {
      orderLevelReasons.push(
        `The ${RETURN_POLICY.windowDays}-day return window has closed (delivered ${deliveredAt.toISOString().slice(0, 10)}).`,
      )
    }
  } else if (input.orderStatus === 'delivered') {
    // Delivered per order_status but no shipment delivered_at on record —
    // fail closed rather than assuming the window is open with no reference
    // date to check it against.
    orderLevelReasons.push('No delivery date is on record for this order — cannot verify the return window.')
  }

  const itemsById = new Map(input.orderItems.map((item) => [item.orderItemId, item]))
  const lines: ReturnLineEligibility[] = input.requestedLines.map((line) => {
    const reasons: string[] = []
    const item = itemsById.get(line.orderItemId)

    if (!item) {
      reasons.push('This item was not found on the order.')
    } else {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        reasons.push('Quantity must be a positive whole number.')
      } else {
        const remaining = item.purchasedQuantity - item.alreadyRequestedQuantity
        if (line.quantity > remaining) {
          reasons.push(`Only ${Math.max(remaining, 0)} unit(s) of this item remain eligible for return.`)
        }
      }
    }

    if (!isReturnReasonCode(line.reasonCode)) {
      reasons.push(`Unrecognized return reason code "${line.reasonCode}".`)
    } else if (reasonRequiresEvidence(line.reasonCode) && !line.hasEvidence) {
      reasons.push(`Reason "${RETURN_REASON_LABELS[line.reasonCode]}" requires at least one photo of the item.`)
    }

    return { orderItemId: line.orderItemId, eligible: reasons.length === 0, reasons }
  })

  const eligible =
    orderLevelReasons.length === 0 &&
    input.requestedLines.length > 0 &&
    lines.every((line) => line.eligible)

  return { eligible, orderLevelReasons, lines }
}
