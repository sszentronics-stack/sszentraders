/**
 * Pure review domain rules — verified-purchase eligibility decision and
 * aggregate-rating computation. Nothing here touches a database (that's
 * backend/services/reviews/reviews.service.ts); unit-testable without a
 * live Supabase project, same split as backend/lib/returns.
 */

export interface ReviewEligibilityInput {
  /** The order_status of the order this order_item belongs to. */
  orderStatus: string
  /** Whether a product_reviews row already exists for this order_item_id (the DB unique constraint is the real guard; this lets the service give a clear pre-check message instead of a raw 23505). */
  alreadyReviewed: boolean
}

export interface ReviewEligibilityResult {
  eligible: boolean
  reasons: string[]
}

/**
 * A customer may review a purchased line item only once it has actually
 * been delivered, and only once — this is the "verified-purchase, no
 * duplicate/unverified abuse" rule the phase spec requires, expressed as a
 * pure decision so it is fully unit testable independent of how the caller
 * loaded the order/order_item/existing-review facts.
 */
export function evaluateReviewEligibility(input: ReviewEligibilityInput): ReviewEligibilityResult {
  const reasons: string[] = []
  if (input.orderStatus !== 'delivered') {
    reasons.push(`This item can be reviewed once its order is delivered (current status: "${input.orderStatus}").`)
  }
  if (input.alreadyReviewed) {
    reasons.push('You have already reviewed this purchase.')
  }
  return { eligible: reasons.length === 0, reasons }
}

export interface RatedReview {
  rating: number
}

export interface AggregateRating {
  average: number
  count: number
}

/** Average rating across published reviews only, rounded to one decimal place — the shape the storefront's star display expects (see src/data/products.js's existing `rating`/`reviewCount` fields). */
export function computeAggregateRating(reviews: readonly RatedReview[]): AggregateRating {
  if (reviews.length === 0) return { average: 0, count: 0 }
  const sum = reviews.reduce((total, r) => total + r.rating, 0)
  return { average: Math.round((sum / reviews.length) * 10) / 10, count: reviews.length }
}
