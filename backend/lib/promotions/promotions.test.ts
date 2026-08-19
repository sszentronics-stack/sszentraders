import { describe, expect, it } from 'vitest'
import {
  computeDiscountAmount,
  evaluateCouponEligibility,
  evaluatePromotionEligibility,
  pickBestAutomaticPromotion,
  scopedSubtotal,
  type CartContext,
  type CouponRule,
  type CustomerContext,
  type PromotionRule,
} from './index'

function makePromotion(overrides: Partial<PromotionRule> = {}): PromotionRule {
  return {
    id: 'promo-1',
    campaignId: null,
    name: 'Test promo',
    discountType: 'percentage',
    discountValue: 10,
    status: 'active',
    startsAt: null,
    endsAt: null,
    minSpend: null,
    firstOrderOnly: false,
    appliesTo: 'all',
    scopeId: null,
    ...overrides,
  }
}

function makeCart(overrides: Partial<CartContext> = {}): CartContext {
  return {
    subtotal: 10000,
    lines: [{ productId: 'p1', categoryIds: ['c1'], collectionIds: [], lineTotal: 10000 }],
    currency: 'PKR',
    ...overrides,
  }
}

const customer: CustomerContext = { customerId: 'cust-1', isFirstOrder: false }

describe('computeDiscountAmount', () => {
  it('computes a percentage discount, floored, never exceeding the base', () => {
    const promo = makePromotion({ discountType: 'percentage', discountValue: 33 })
    const cart = makeCart({ subtotal: 10001, lines: [{ productId: 'p1', categoryIds: [], collectionIds: [], lineTotal: 10001 }] })
    const result = computeDiscountAmount(promo, cart)
    expect(result.discountAmount).toBe(Math.floor((10001 * 33) / 100))
    expect(result.discountAmount).toBeLessThanOrEqual(cart.subtotal)
  })

  it('clamps a percentage at 100', () => {
    const promo = makePromotion({ discountType: 'percentage', discountValue: 500 })
    const cart = makeCart({ subtotal: 5000, lines: [{ productId: 'p1', categoryIds: [], collectionIds: [], lineTotal: 5000 }] })
    expect(computeDiscountAmount(promo, cart).discountAmount).toBe(5000)
  })

  it('never returns a fixed-amount discount larger than the (scoped) subtotal', () => {
    const promo = makePromotion({ discountType: 'fixed_amount', discountValue: 999999 })
    const cart = makeCart({ subtotal: 5000, lines: [{ productId: 'p1', categoryIds: [], collectionIds: [], lineTotal: 5000 }] })
    expect(computeDiscountAmount(promo, cart).discountAmount).toBe(5000)
  })

  it('free_shipping never discounts the subtotal, only flags free shipping', () => {
    const promo = makePromotion({ discountType: 'free_shipping', discountValue: 0 })
    const cart = makeCart()
    const result = computeDiscountAmount(promo, cart)
    expect(result.discountAmount).toBe(0)
    expect(result.freeShipping).toBe(true)
  })

  it('scopes a category-restricted discount to only matching lines', () => {
    const promo = makePromotion({ discountType: 'percentage', discountValue: 50, appliesTo: 'category', scopeId: 'c1' })
    const cart = makeCart({
      subtotal: 15000,
      lines: [
        { productId: 'p1', categoryIds: ['c1'], collectionIds: [], lineTotal: 10000 },
        { productId: 'p2', categoryIds: ['c2'], collectionIds: [], lineTotal: 5000 },
      ],
    })
    expect(scopedSubtotal(promo, cart)).toBe(10000)
    expect(computeDiscountAmount(promo, cart).discountAmount).toBe(5000)
  })
})

describe('evaluatePromotionEligibility', () => {
  it('reports every unmet reason at once, not just the first', () => {
    const promo = makePromotion({ status: 'paused', minSpend: 100000, firstOrderOnly: true })
    const result = evaluatePromotionEligibility(promo, makeCart({ subtotal: 100 }), customer)
    expect(result.eligible).toBe(false)
    expect(result.reasons.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects outside the date window', () => {
    const promo = makePromotion({ startsAt: '2099-01-01T00:00:00Z' })
    const result = evaluatePromotionEligibility(promo, makeCart(), customer, new Date('2026-01-01'))
    expect(result.eligible).toBe(false)
  })

  it('accepts a plain eligible promotion', () => {
    const result = evaluatePromotionEligibility(makePromotion(), makeCart(), customer)
    expect(result.eligible).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('enforces first-order-only', () => {
    const promo = makePromotion({ firstOrderOnly: true })
    expect(evaluatePromotionEligibility(promo, makeCart(), { ...customer, isFirstOrder: false }).eligible).toBe(false)
    expect(evaluatePromotionEligibility(promo, makeCart(), { ...customer, isFirstOrder: true }).eligible).toBe(true)
  })
})

describe('evaluateCouponEligibility', () => {
  function makeCoupon(overrides: Partial<CouponRule> = {}): CouponRule {
    return {
      id: 'coupon-1',
      promotionId: 'promo-1',
      code: 'SAVE10',
      usageLimit: null,
      usageLimitPerCustomer: null,
      timesUsed: 0,
      status: 'active',
      ...overrides,
    }
  }

  it('rejects a coupon that has hit its global usage limit', () => {
    const coupon = makeCoupon({ usageLimit: 5, timesUsed: 5 })
    const result = evaluateCouponEligibility(coupon, makePromotion(), makeCart(), customer)
    expect(result.eligible).toBe(false)
    expect(result.reasons.some((r) => r.includes('usage limit'))).toBe(true)
  })

  it('rejects when the customer already used it up to their per-customer limit', () => {
    const coupon = makeCoupon({ usageLimitPerCustomer: 1 })
    const result = evaluateCouponEligibility(coupon, makePromotion(), makeCart(), { ...customer, customerCouponUseCount: 1 })
    expect(result.eligible).toBe(false)
  })

  it('accepts an eligible active coupon under its limits', () => {
    const coupon = makeCoupon({ usageLimit: 10, timesUsed: 3, usageLimitPerCustomer: 2 })
    const result = evaluateCouponEligibility(coupon, makePromotion(), makeCart(), { ...customer, customerCouponUseCount: 0 })
    expect(result.eligible).toBe(true)
  })
})

describe('pickBestAutomaticPromotion', () => {
  it('picks the highest-value eligible promotion, ignoring ineligible ones', () => {
    const cheap = makePromotion({ id: 'p-cheap', discountType: 'fixed_amount', discountValue: 500 })
    const ineligible = makePromotion({ id: 'p-ineligible', discountType: 'fixed_amount', discountValue: 999999, minSpend: 999999 })
    const best = makePromotion({ id: 'p-best', discountType: 'percentage', discountValue: 20 })
    const cart = makeCart({ subtotal: 10000, lines: [{ productId: 'p1', categoryIds: [], collectionIds: [], lineTotal: 10000 }] })

    const result = pickBestAutomaticPromotion([cheap, ineligible, best], cart, customer, 0)
    expect(result?.promotion.id).toBe('p-best')
    expect(result?.breakdown.discountAmount).toBe(2000)
  })

  it('returns null when nothing is eligible', () => {
    const ineligible = makePromotion({ status: 'paused' })
    const result = pickBestAutomaticPromotion([ineligible], makeCart(), customer, 0)
    expect(result).toBeNull()
  })

  it('weighs a free-shipping promotion against the shipping cost', () => {
    const shipping = makePromotion({ id: 'ship', discountType: 'free_shipping', discountValue: 0 })
    const small = makePromotion({ id: 'small', discountType: 'fixed_amount', discountValue: 100 })
    const result = pickBestAutomaticPromotion([shipping, small], makeCart(), customer, 500)
    expect(result?.promotion.id).toBe('ship')
  })
})
