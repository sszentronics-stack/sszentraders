import { describe, expect, it } from 'vitest'
import { deriveFacets, filterProducts, matchesQuery, sortProducts, suggestProducts } from './productSearch'
import type { StorefrontProduct } from '../data/catalogAdapter'

function makeProduct(overrides: Partial<StorefrontProduct>): StorefrontProduct {
  return {
    id: 'p1',
    slug: 'p1',
    brand: 'SADOER',
    name: 'Collagen Mask',
    shortName: 'Collagen Mask',
    tagline: 'Replenish collagen',
    subtitle: '25g sheet mask',
    price: 129,
    compareAt: 199,
    badge: null,
    featured: false,
    inStock: true,
    category: 'Masks',
    type: 'Facial Mask',
    sku: 'SKU-1',
    rating: 0,
    reviewCount: 0,
    images: ['/a.png'],
    highlights: [],
    description: '',
    benefits: [],
    howToUse: [],
    ingredients: '',
    details: [],
    ...overrides,
  }
}

const products = [
  makeProduct({ id: '1', name: 'SADOER Collagen Mask', brand: 'SADOER', category: 'Masks', price: 129, rating: 4.8, reviewCount: 42 }),
  makeProduct({ id: '2', name: 'Hero Mighty Patch', brand: 'Hero Cosmetics', category: 'Acne Care', price: 4400, rating: 4.9, reviewCount: 128, featured: true }),
  makeProduct({ id: '3', name: 'SOME BY MI Toner', brand: 'SOME BY MI', category: 'Toners', price: 7900, rating: 4.8, reviewCount: 96 }),
]

describe('matchesQuery', () => {
  it('matches with no query', () => {
    expect(matchesQuery(products[0]!, undefined)).toBe(true)
  })

  it('matches a substring across name/brand/category', () => {
    expect(matchesQuery(products[0]!, 'sadoer')).toBe(true)
    expect(matchesQuery(products[1]!, 'acne')).toBe(true)
  })

  it('requires every term to match (AND search)', () => {
    expect(matchesQuery(products[0]!, 'sadoer mask')).toBe(true)
    expect(matchesQuery(products[0]!, 'sadoer toner')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(matchesQuery(products[0]!, 'SADOER')).toBe(true)
  })
})

describe('filterProducts', () => {
  it('filters by category', () => {
    expect(filterProducts(products, { category: 'Toners' }).map((p) => p.id)).toEqual(['3'])
  })

  it('filters by brand', () => {
    expect(filterProducts(products, { brand: 'Hero Cosmetics' }).map((p) => p.id)).toEqual(['2'])
  })

  it('filters by price range', () => {
    expect(filterProducts(products, { minPrice: 1000, maxPrice: 8000 }).map((p) => p.id)).toEqual(['2', '3'])
  })

  it('combines query + facet filters', () => {
    expect(filterProducts(products, { q: 'toner', category: 'Toners' }).map((p) => p.id)).toEqual(['3'])
    expect(filterProducts(products, { q: 'toner', category: 'Masks' })).toHaveLength(0)
  })

  it('filters by availability', () => {
    const withOos = [...products, makeProduct({ id: '4', inStock: false })]
    expect(filterProducts(withOos, { availability: 'in-stock' })).toHaveLength(3)
  })
})

describe('sortProducts', () => {
  it('sorts by price ascending/descending', () => {
    expect(sortProducts(products, 'price-asc').map((p) => p.id)).toEqual(['1', '2', '3'])
    expect(sortProducts(products, 'price-desc').map((p) => p.id)).toEqual(['3', '2', '1'])
  })

  it('sorts popular by rating then review count then featured', () => {
    // product 2: rating 4.9 (highest) wins outright.
    // products 1 & 3 tie at rating 4.8, so reviewCount breaks the tie: 3 (96) before 1 (42).
    expect(sortProducts(products, 'popular').map((p) => p.id)).toEqual(['2', '3', '1'])
  })

  it('does not mutate the input array', () => {
    const copy = products.slice()
    sortProducts(products, 'price-asc')
    expect(products).toEqual(copy)
  })
})

describe('deriveFacets', () => {
  it('derives unique sorted categories/brands and the price range', () => {
    const facets = deriveFacets(products)
    expect(facets.categories).toEqual(['Acne Care', 'Masks', 'Toners'])
    expect(facets.brands).toEqual(['Hero Cosmetics', 'SADOER', 'SOME BY MI'])
    expect(facets.minPrice).toBe(129)
    expect(facets.maxPrice).toBe(7900)
  })
})

describe('suggestProducts', () => {
  it('is empty for an empty query', () => {
    expect(suggestProducts(products, '')).toEqual([])
  })

  it('caps results to the limit', () => {
    expect(suggestProducts(products, 'o', 2)).toHaveLength(2)
  })
})
