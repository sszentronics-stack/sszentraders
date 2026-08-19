/**
 * Pure promotions/discount domain rules — eligibility evaluation and
 * deterministic discount-amount calculation. Nothing here touches a
 * database (that's backend/services/promotions/promotions.service.ts);
 * unit-testable without a live Supabase project, same pattern as
 * backend/lib/money and backend/lib/cart.
 *
 * STACKING/PRECEDENCE RULE (deliberately simple — see the phase spec's
 * "don't over-build a rules DSL" guidance): at most ONE promotion applies
 * to an order, ever.
 *   1. A caller-supplied coupon code, if present and eligible, always wins
 *      — the customer explicitly asked for it.
 *   2. Otherwise, the single best (highest discount amount) currently
 *      active AUTOMATIC promotion (one with no coupon requirement) that
 *      the cart is eligible for is applied, if any.
 *   3. Nothing ever stacks. This avoids the abuse surface and UX confusion
 *      of combinable discounts entirely, at the cost of not supporting
 *      "10% off + free shipping together" — an acceptable trade for this
 *      phase's scope.
 *
 * "Never trust a client-computed discount amount" (phase spec): every
 * function here is called ONLY from
 * backend/services/promotions/promotions.service.ts inside an Edge
 * Function, using server-loaded promotion/coupon rows and a server-computed
 * cart context — never anything the client asserts about its own discount.
 */

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping'
export type PromotionScope = 'all' | 'category' | 'collection' | 'product'

export interface PromotionRule {
  id: string
  campaignId: string | null
  name: string
  discountType: DiscountType
  discountValue: number // percentage (0-100) or minor-unit amount, per discountType
  status: 'draft' | 'active' | 'paused' | 'expired' | 'archived'
  startsAt: string | null
  endsAt: string | null
  minSpend: number | null // minor units
  firstOrderOnly: boolean
  appliesTo: PromotionScope
  scopeId: string | null
}

export interface CouponRule {
  id: string
  promotionId: string
  code: string
  usageLimit: number | null
  usageLimitPerCustomer: number | null
  timesUsed: number
  status: 'draft' | 'active' | 'paused' | 'expired' | 'archived'
}

export interface CartLineContext {
  productId: string
  categoryIds: string[]
  collectionIds: string[]
  lineTotal: number // minor units, post any per-line adjustments already applied (e.g. inventory clamp)
}

export interface CartContext {
  subtotal: number // minor units — sum of all line totals
  lines: CartLineContext[]
  currency: string
}

export interface CustomerContext {
  customerId: string | null
  isFirstOrder: boolean
  /** How many times this specific customer has already redeemed this coupon (coupon_redemptions count) — only relevant when evaluating a CouponRule. */
  customerCouponUseCount?: number
}

export interface EligibilityResult {
  eligible: boolean
  reasons: string[]
}

function isWithinWindow(promotion: PromotionRule, now: Date): boolean {
  if (promotion.startsAt && now < new Date(promotion.startsAt)) return false
  if (promotion.endsAt && now > new Date(promotion.endsAt)) return false
  return true
}

/** Minor-unit subtotal of only the cart lines a scoped promotion actually applies to. */
export function scopedSubtotal(promotion: PromotionRule, cart: CartContext): number {
  if (promotion.appliesTo === 'all' || !promotion.scopeId) return cart.subtotal
  return cart.lines.reduce((sum, line) => {
    const matches =
      (promotion.appliesTo === 'product' && line.productId === promotion.scopeId) ||
      (promotion.appliesTo === 'category' && line.categoryIds.includes(promotion.scopeId as string)) ||
      (promotion.appliesTo === 'collection' && line.collectionIds.includes(promotion.scopeId as string))
    return matches ? sum + line.lineTotal : sum
  }, 0)
}

/**
 * Non-deceptive eligibility check: always returns EVERY unmet reason (not
 * just the first), so the UI can show the customer exactly why a coupon
 * didn't apply (spec: "show ... unmet-eligibility reasons").
 */
export function evaluatePromotionEligibility(
  promotion: PromotionRule,
  cart: CartContext,
  customer: CustomerContext,
  now: Date = new Date(),
): EligibilityResult {
  const reasons: string[] = []

  if (promotion.status !== 'active') reasons.push('This promotion is not currently active.')
  if (!isWithinWindow(promotion, now)) reasons.push('This promotion is outside its valid date range.')
  if (promotion.firstOrderOnly && !customer.isFirstOrder) reasons.push('This offer is only available on your first order.')

  const relevantSubtotal = scopedSubtotal(promotion, cart)
  if (promotion.minSpend != null && relevantSubtotal < promotion.minSpend) {
    reasons.push(`Add more to your cart to reach the minimum spend for this offer.`)
  }
  if (promotion.appliesTo !== 'all' && relevantSubtotal === 0) {
    reasons.push('Your cart has no items eligible for this offer.')
  }

  return { eligible: reasons.length === 0, reasons }
}

export function evaluateCouponEligibility(
  coupon: CouponRule,
  promotion: PromotionRule,
  cart: CartContext,
  customer: CustomerContext,
  now: Date = new Date(),
): EligibilityResult {
  const base = evaluatePromotionEligibility(promotion, cart, customer, now)
  const reasons = [...base.reasons]

  if (coupon.status !== 'active') reasons.push('This coupon code is not currently active.')
  if (coupon.usageLimit != null && coupon.timesUsed >= coupon.usageLimit) {
    reasons.push('This coupon has reached its usage limit.')
  }
  if (
    coupon.usageLimitPerCustomer != null &&
    (customer.customerCouponUseCount ?? 0) >= coupon.usageLimitPerCustomer
  ) {
    reasons.push('You have already used this coupon the maximum number of times.')
  }

  return { eligible: reasons.length === 0, reasons }
}

export interface DiscountBreakdown {
  discountAmount: number // minor units, always applied against the merchandise subtotal
  freeShipping: boolean
}

/**
 * Deterministic discount calculation. Never returns a discount larger than
 * the (scoped) subtotal it applies against — a percentage/fixed discount
 * can never make the discounted line total negative.
 */
export function computeDiscountAmount(promotion: PromotionRule, cart: CartContext): DiscountBreakdown {
  const base = scopedSubtotal(promotion, cart)

  if (promotion.discountType === 'free_shipping') {
    return { discountAmount: 0, freeShipping: true }
  }

  if (promotion.discountType === 'percentage') {
    const pct = Math.max(0, Math.min(100, promotion.discountValue))
    // Floor, never round up — never give away more than the stated percentage.
    const amount = Math.floor((base * pct) / 100)
    return { discountAmount: Math.min(amount, base), freeShipping: false }
  }

  // fixed_amount
  return { discountAmount: Math.min(Math.max(0, promotion.discountValue), base), freeShipping: false }
}

/**
 * Given every currently-active automatic (no-coupon) promotion the cart is
 * eligible for, pick the single best one for the customer (highest discount
 * amount; a free-shipping promotion is compared using a caller-supplied
 * `shippingTotal` value so it can be weighed fairly against a percentage/
 * fixed promotion). Returns null when none are eligible.
 */
export function pickBestAutomaticPromotion(
  promotions: PromotionRule[],
  cart: CartContext,
  customer: CustomerContext,
  shippingTotal: number,
  now: Date = new Date(),
): { promotion: PromotionRule; breakdown: DiscountBreakdown } | null {
  let best: { promotion: PromotionRule; breakdown: DiscountBreakdown; value: number } | null = null

  for (const promotion of promotions) {
    const eligibility = evaluatePromotionEligibility(promotion, cart, customer, now)
    if (!eligibility.eligible) continue
    const breakdown = computeDiscountAmount(promotion, cart)
    const value = breakdown.freeShipping ? shippingTotal : breakdown.discountAmount
    if (!best || value > best.value) {
      best = { promotion, breakdown, value }
    }
  }

  return best ? { promotion: best.promotion, breakdown: best.breakdown } : null
}
