/**
 * Pure catalog domain rules shared by the products/catalog services and (in
 * principle) any future client — promotional math, campaign windows, and
 * "is this product actually ready to publish" draft-safety checks. Nothing
 * here touches a database; that keeps these rules unit-testable without a
 * live Supabase project (none exists in this environment yet).
 */

/** Percentage off, rounded, or 0 if there is no genuine discount. Mirrors src/data/products.js's salePercent() for parity with the existing storefront math. */
export function computeDiscountPercent(price: number, compareAtPrice: number | null | undefined): number {
  if (!compareAtPrice || compareAtPrice <= price) return 0
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
}

/**
 * A collection (campaign) is "live" only within its optional starts_at/
 * ends_at window. Both bounds are optional — an unset bound means
 * unbounded on that side (e.g. no starts_at = already started).
 */
export function isWithinCampaignWindow(
  now: Date,
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): boolean {
  if (startsAt && now < new Date(startsAt)) return false
  if (endsAt && now > new Date(endsAt)) return false
  return true
}

export interface PublishReadinessInput {
  variantCount: number
  publishedVariantCount: number
  imageCount: number
}

export interface PublishReadinessResult {
  ready: boolean
  reasons: string[]
}

/**
 * Draft-safety gate: a product cannot move to `published` unless it has at
 * least one published variant/SKU and at least one image. Prevents an admin
 * from accidentally publishing an empty/incomplete product to the live
 * storefront.
 */
export function assessPublishReadiness(input: PublishReadinessInput): PublishReadinessResult {
  const reasons: string[] = []
  if (input.variantCount === 0) {
    reasons.push('Product has no variants/SKUs.')
  } else if (input.publishedVariantCount === 0) {
    reasons.push('Product has no published (non-draft, non-archived) variant/SKU.')
  }
  if (input.imageCount === 0) {
    reasons.push('Product has no images.')
  }
  return { ready: reasons.length === 0, reasons }
}

/**
 * Derive a display badge from admin-set content vs. computed discount math,
 * used when the admin hasn't explicitly set attributes.badge. Explicit
 * admin choice always wins; this is only the fallback.
 */
export function computeDefaultBadge(params: {
  price: number
  compareAtPrice: number | null | undefined
  isFeatured: boolean
  publishedAt: string | null | undefined
  now?: Date
}): 'sale' | 'new' | 'bestseller' | null {
  if (computeDiscountPercent(params.price, params.compareAtPrice) > 0) return 'sale'
  const now = params.now ?? new Date()
  if (params.publishedAt) {
    const publishedMs = new Date(params.publishedAt).getTime()
    const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
    if (now.getTime() - publishedMs <= NEW_WINDOW_MS) return 'new'
  }
  if (params.isFeatured) return 'bestseller'
  return null
}
