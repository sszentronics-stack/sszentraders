/**
 * Pure search/filter/sort helpers for the Shop page (Phase 4). Operate on
 * the already-loaded StorefrontProduct[] list (see
 * src/hooks/useCatalog.js's "load once, derive everything in memory"
 * approach — the catalog is small enough that this stays instant and keeps
 * the loading/empty/error story identical everywhere). No I/O here, so this
 * is unit-testable without a live Supabase project, same pattern as
 * backend/lib.
 */
import type { StorefrontProduct } from '../data/catalogAdapter'

export type SortOption = 'relevance' | 'newest' | 'price-asc' | 'price-desc' | 'popular'

export interface ProductFilters {
  q?: string
  category?: string
  brand?: string
  minPrice?: number
  maxPrice?: number
  availability?: 'in-stock' | 'all'
}

/** Lowercase, trimmed, whitespace-collapsed search terms — every term must match for a product to qualify (simple AND search, tolerant of extra words/order). */
function normalizeTerms(query: string | undefined): string[] {
  return (query ?? '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function haystack(product: StorefrontProduct): string {
  return [product.name, product.shortName, product.brand, product.category, product.type, product.tagline, product.subtitle]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Every search term must appear somewhere in the product's searchable text (name/brand/category/type/tagline). */
export function matchesQuery(product: StorefrontProduct, query: string | undefined): boolean {
  const terms = normalizeTerms(query)
  if (terms.length === 0) return true
  const hay = haystack(product)
  return terms.every((term) => hay.includes(term))
}

/** Apply query + facet filters. Each filter is a no-op when unset/empty. */
export function filterProducts(products: StorefrontProduct[], filters: ProductFilters): StorefrontProduct[] {
  return products.filter((p) => {
    if (!matchesQuery(p, filters.q)) return false
    if (filters.category && p.category !== filters.category) return false
    if (filters.brand && p.brand !== filters.brand) return false
    if (filters.minPrice != null && p.price < filters.minPrice) return false
    if (filters.maxPrice != null && p.price > filters.maxPrice) return false
    if (filters.availability === 'in-stock' && !p.inStock) return false
    return true
  })
}

/**
 * Sort products. 'relevance' is a stable no-op (keeps catalog/search order —
 * meaningful once query terms exist, otherwise falls through to the
 * catalog's own order). 'popular' uses real signals only (rating, then
 * review count, then featured flag) — never an invented number.
 */
export function sortProducts(products: StorefrontProduct[], sort: SortOption): StorefrontProduct[] {
  const list = products.slice()
  switch (sort) {
    case 'price-asc':
      return list.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return list.sort((a, b) => b.price - a.price)
    case 'popular':
      return list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviewCount || 0) - (a.reviewCount || 0) || Number(b.featured) - Number(a.featured))
    case 'newest':
      // Products are already loaded newest-first (see products.repository.ts's
      // listPublishedProducts ordering / the fallback dataset's authored order);
      // this is a stable pass-through rather than re-deriving a date sort here.
      return list
    case 'relevance':
    default:
      return list
  }
}

export interface FacetOptions {
  categories: string[]
  brands: string[]
  minPrice: number
  maxPrice: number
}

/** Derive filter UI options from the full, unfiltered product list. */
export function deriveFacets(products: StorefrontProduct[]): FacetOptions {
  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort()
  const brands = Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort()
  const prices = products.map((p) => p.price)
  return {
    categories,
    brands,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  }
}

/** Top N product suggestions for header autocomplete — same matching rule as the Shop page, capped for a compact dropdown. */
export function suggestProducts(products: StorefrontProduct[], query: string, limit = 5): StorefrontProduct[] {
  if (normalizeTerms(query).length === 0) return []
  return filterProducts(products, { q: query }).slice(0, limit)
}
