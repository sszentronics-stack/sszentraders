import { describe, expect, it, vi } from 'vitest'

// getPublicImageUrl touches the Supabase browser client; stub it so this
// stays a pure unit test of the mapping logic (no live project needed).
vi.mock('../lib/supabase/storage', () => ({
  getPublicImageUrl: (_bucket: string, path: string | null) => (path ? `https://cdn.test/${path}` : null),
}))

const { adaptProduct } = await import('./catalogAdapter')
const { toMinorUnits } = await import('../../backend/lib/money')

function baseProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    brandId: 'b1',
    name: 'SADOER Collagen Anti-Aging Facial Mask',
    slug: 'sadoer-collagen-anti-aging-facial-mask',
    shortDescription: 'Replenish collagen, restore youthful skin',
    description: 'Full description here.',
    ingredients: 'Hydrolyzed Collagen, Niacinamide',
    directions: 'Cleanse.\nApply mask.\nRemove after 20 minutes.',
    productType: 'Facial Mask',
    status: 'published',
    isFeatured: true,
    seoTitle: null,
    seoDescription: null,
    publishedAt: '2026-08-01T00:00:00Z',
    attributes: {},
    variants: [
      {
        id: 'v1',
        productId: 'p1',
        sku: 'ABC-SADOER-SD80885',
        title: '25g',
        price: toMinorUnits(129),
        compareAtPrice: toMinorUnits(199),
        currency: 'PKR',
        attributes: {},
        status: 'published',
        ledgixItemId: null,
      },
    ],
    images: [
      { id: 'img1', productId: 'p1', variantId: null, storagePath: 'p1/default/img1.jpg', altText: null, sortOrder: 0, isPrimary: true },
    ],
    brand: { id: 'b1', name: 'SADOER', slug: 'sadoer' },
    categories: [{ id: 'c1', name: 'Masks', slug: 'masks' }],
    collections: [],
    ...overrides,
  } as unknown as import('../repositories/products.repository').ProductWithRelations
}

describe('adaptProduct', () => {
  it('converts minor-unit prices to major units', () => {
    const result = adaptProduct(baseProduct())
    expect(result.price).toBe(129)
    expect(result.compareAt).toBe(199)
  })

  it('maps brand name, category, and sku from relations', () => {
    const result = adaptProduct(baseProduct())
    expect(result.brand).toBe('SADOER')
    expect(result.category).toBe('Masks')
    expect(result.sku).toBe('ABC-SADOER-SD80885')
  })

  it('defaults badge to "sale" when discounted, even with no explicit attributes.badge', () => {
    const result = adaptProduct(baseProduct())
    expect(result.badge).toBe('sale')
  })

  it('prefers an explicit attributes.badge over the computed default', () => {
    const result = adaptProduct(baseProduct({ attributes: { badge: 'bestseller' } }))
    expect(result.badge).toBe('bestseller')
  })

  it('builds public image URLs from storage paths', () => {
    const result = adaptProduct(baseProduct())
    expect(result.images).toEqual(['https://cdn.test/p1/default/img1.jpg'])
  })

  it('falls back to directions split by newline when attributes.howToUse is absent', () => {
    const result = adaptProduct(baseProduct())
    expect(result.howToUse).toEqual(['Cleanse.', 'Apply mask.', 'Remove after 20 minutes.'])
  })

  it('never leaves inStock false — Aura has no stock-quantity concept yet', () => {
    const result = adaptProduct(baseProduct())
    expect(result.inStock).toBe(true)
  })
})
