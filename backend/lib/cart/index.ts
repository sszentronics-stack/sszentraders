/**
 * Pure cart domain rules — merge-on-login math, line revalidation against a
 * live variant/product snapshot, and totals. Nothing here touches a
 * database (that's backend/services/cart/cart.service.ts); it stays
 * unit-testable without a live Supabase project, same pattern as
 * backend/lib/catalog.
 *
 * "Never trust totals sent by the browser" (Phase 5 spec) is enforced by
 * construction here: every function below only ever computes a total from
 * a `variant` snapshot the caller fetched itself from the database in the
 * same request — a client-supplied price is never an input to this module.
 */
import { calculateLineTotal, sumMinorUnits } from '../money/index.ts'
import { assessCheckoutAvailability } from '../inventory/index.ts'

export const MAX_LINE_QUANTITY = 999

export interface CartLineInput {
  variantId: string
  quantity: number
}

/**
 * Merge an incoming set of lines (e.g. a guest cart captured just before
 * login) into an existing set, summing quantities for the same variant and
 * capping at MAX_LINE_QUANTITY. Order of the result follows `existing` first,
 * then any variants that only appeared in `incoming`.
 */
export function mergeCartLines(existing: CartLineInput[], incoming: CartLineInput[]): CartLineInput[] {
  const byVariant = new Map<string, number>()
  for (const line of existing) {
    byVariant.set(line.variantId, (byVariant.get(line.variantId) ?? 0) + line.quantity)
  }
  for (const line of incoming) {
    byVariant.set(line.variantId, (byVariant.get(line.variantId) ?? 0) + line.quantity)
  }
  return Array.from(byVariant.entries()).map(([variantId, quantity]) => ({
    variantId,
    quantity: Math.min(quantity, MAX_LINE_QUANTITY),
  }))
}

export interface VariantSnapshot {
  id: string
  price: number // minor units
  status: 'draft' | 'published' | 'archived'
  productStatus: 'draft' | 'published' | 'archived'
  /**
   * Synced inventory_cache quantity (Phase 9), or null/undefined when no
   * reliable cache data exists yet (unmapped/never-synced variant) — see
   * backend/lib/inventory's assessCheckoutAvailability for why "unknown"
   * never blocks a sale by itself.
   */
  availableQuantity?: number | null
}

export interface RevalidateLineInput {
  requestedQuantity: number
  /** null when the variant/product has been deleted since the item was added. */
  variant: VariantSnapshot | null
  /** The unit price recorded when this line was last added/updated, for change detection only. */
  previousUnitPrice?: number | null
}

export type RevalidatedLine =
  | {
      keep: true
      quantity: number
      unitPrice: number
      lineTotal: number
      priceChanged: boolean
      /** True when `quantity` was clamped down from what was requested/stored because inventory_cache reports less is available. */
      quantityAdjusted: boolean
    }
  | {
      keep: false
      reason: 'variant_unavailable' | 'product_unavailable' | 'out_of_stock'
    }

/**
 * Re-check one cart line against the live catalog (and, since Phase 9,
 * ERP-synced availability) before returning cart totals or allowing
 * checkout. A line whose variant was archived/deleted, whose product was
 * unpublished/deleted, or whose inventory_cache reports zero available is
 * dropped — never silently kept at a stale price or an unsellable quantity
 * — so the storefront can surface "this item is no longer available"
 * rather than charging for something that can't be fulfilled. A line
 * requesting more than is available is kept but clamped down, never
 * rejected outright — "never oversell", not "never let them buy what's
 * left."
 */
export function revalidateCartLine(input: RevalidateLineInput): RevalidatedLine {
  const { variant, requestedQuantity, previousUnitPrice } = input
  if (!variant) return { keep: false, reason: 'variant_unavailable' }
  if (variant.status !== 'published') return { keep: false, reason: 'variant_unavailable' }
  if (variant.productStatus !== 'published') return { keep: false, reason: 'product_unavailable' }

  const clampedRequest = Math.min(Math.max(1, requestedQuantity), MAX_LINE_QUANTITY)
  const availability = assessCheckoutAvailability(clampedRequest, variant.availableQuantity)
  if (!availability.ok) return { keep: false, reason: 'out_of_stock' }

  const quantity = availability.allowedQuantity
  const unitPrice = variant.price
  const priceChanged = previousUnitPrice != null && previousUnitPrice !== unitPrice

  return {
    keep: true,
    quantity,
    unitPrice,
    lineTotal: calculateLineTotal({ unitPrice, quantity }),
    priceChanged,
    quantityAdjusted: quantity !== clampedRequest,
  }
}

export interface CartSummaryLine {
  lineTotal: number
}

/** Sum revalidated line totals into a cart subtotal (minor units). */
export function computeCartSubtotal(lines: CartSummaryLine[]): number {
  return sumMinorUnits(lines.map((l) => l.lineTotal))
}

/**
 * Recently-viewed / wishlist-style "keep the most recent N" trim, applied
 * client-side of the DB write (the service upserts, then deletes anything
 * beyond the cap) so storage stays privacy-conscious and bounded per spec
 * ("recently viewed persistence... with privacy-conscious limits").
 */
export function trimToMostRecent<T extends { viewedAt: string }>(items: T[], limit: number): T[] {
  return items
    .slice()
    .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
    .slice(0, limit)
}
