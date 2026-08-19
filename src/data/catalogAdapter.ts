/**
 * Adapts a backend-driven ProductWithRelations (src/repositories/products.repository.ts)
 * into the flat "storefront product" shape the existing Aura components
 * (ProductCard, pages/Home, pages/Shop, pages/Product) already render —
 * the exact same shape src/data/products.js's static fallback dataset
 * uses. This is what lets Phase 3 point the storefront at Supabase without
 * touching component markup/styling: the theme is untouched because the
 * components never change, only where their `product` prop's data
 * originates.
 */
import { toMajorUnits } from '../../backend/lib/money'
import { computeDefaultBadge, computeDiscountPercent } from '../../backend/lib/catalog'
import { computeAvailabilityState, type AvailabilityState } from '../../backend/lib/inventory'
import { getPublicImageUrl } from '../lib/supabase/storage'
import type { ProductWithRelations } from '../repositories/products.repository'

export interface StorefrontProduct {
  id: string
  /** The sellable variant/SKU id this card/page currently represents — what Phase 5's server-backed cart/wishlist reference. Absent on the offline fallback dataset (no live variant exists to reference), which is fine: that dataset only ever powers the localStorage cart fallback path. */
  variantId?: string
  slug: string
  brand: string
  name: string
  shortName: string
  tagline: string
  subtitle: string
  price: number
  compareAt: number
  badge: 'new' | 'sale' | 'bestseller' | null
  featured: boolean
  inStock: boolean
  /** Phase 9: real synced availability state, or 'unknown'/absent when the variant has no reliable inventory_cache data yet — see backend/lib/inventory. Optional because a few lightweight card shapes (recently-viewed, wishlist) don't carry it. */
  availability?: AvailabilityState
  category: string
  type: string
  sku: string
  rating: number
  reviewCount: number
  images: string[]
  highlights: string[]
  description: string
  benefits: string[]
  howToUse: string[]
  ingredients: string
  details: [string, string][]
}

function primaryVariant(product: ProductWithRelations) {
  return product.variants.find((v) => v.status === 'published') ?? product.variants[0] ?? null
}

/** Map a backend product + its relations into the shape every existing storefront component already expects. */
export function adaptProduct(product: ProductWithRelations): StorefrontProduct {
  const variant = primaryVariant(product)
  const attrs = (product.attributes ?? {}) as Record<string, unknown>
  const price = variant ? toMajorUnits(variant.price) : 0
  const compareAt = variant?.compareAtPrice ? toMajorUnits(variant.compareAtPrice) : 0

  const badge =
    (attrs.badge as StorefrontProduct['badge'] | undefined) ??
    computeDefaultBadge({
      price,
      compareAtPrice: compareAt || null,
      isFeatured: product.isFeatured,
      publishedAt: product.publishedAt,
    })

  const images = product.images.length
    ? product.images
        .map((img) => getPublicImageUrl('product-images', img.storagePath))
        .filter((url): url is string => Boolean(url))
    : []

  const details: [string, string][] = (attrs.details as [string, string][] | undefined) ?? [
    ...(product.brand ? ([['Brand', product.brand.name]] as [string, string][]) : []),
    ...(variant?.title ? ([['Size', variant.title]] as [string, string][]) : []),
  ]

  // Phase 9: an 'unknown' availability (no inventory_cache row yet — the
  // variant isn't ERP-mapped/synced) is treated as sellable, matching
  // backend/lib/inventory's checkout-side rule: never block a sale on
  // missing data alone. Only a real, synced zero blocks "Add to bag".
  const availability = computeAvailabilityState(variant?.availableQuantity)

  return {
    id: product.id,
    variantId: variant?.id,
    slug: product.slug,
    brand: product.brand?.name ?? '',
    name: product.name,
    shortName: (attrs.shortName as string | undefined) ?? product.name,
    tagline: (attrs.tagline as string | undefined) ?? product.shortDescription ?? '',
    subtitle: (attrs.subtitle as string | undefined) ?? variant?.title ?? '',
    price,
    compareAt,
    badge: badge ?? null,
    featured: product.isFeatured,
    inStock: availability !== 'out_of_stock',
    availability,
    category: product.categories[0]?.name ?? '',
    type: product.productType ?? '',
    sku: variant?.sku ?? '',
    rating: (attrs.rating as number | undefined) ?? 0,
    reviewCount: (attrs.reviewCount as number | undefined) ?? 0,
    images,
    highlights: (attrs.highlights as string[] | undefined) ?? [],
    description: product.description ?? '',
    benefits: (attrs.benefits as string[] | undefined) ?? [],
    howToUse: (attrs.howToUse as string[] | undefined) ?? (product.directions ? product.directions.split('\n').filter(Boolean) : []),
    ingredients: product.ingredients ?? '',
    details,
  }
}

/** Re-export for callers that only need the discount-percent math (parity with src/data/products.js's salePercent). */
export { computeDiscountPercent as salePercentFromMinorUnits }
