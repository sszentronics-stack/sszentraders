/**
 * Thin data-access wrapper around Supabase for published catalog reads.
 *
 * Phase 3 wires this into the live storefront (see src/hooks/useCatalog.ts
 * and src/data/catalogAdapter.ts) with a static fallback dataset
 * (src/data/products.js) for the "no Supabase project configured/reachable
 * yet" case documented in docs/phase-3-completion-report.md.
 *
 * Every Supabase call for products/catalog data belongs here — components
 * must never call `getSupabaseBrowserClient()` / `.from('products')`
 * directly, so there is exactly one place that knows the table/column
 * shape and can evolve it without touching UI code.
 *
 * SECURITY: every select below is field-scoped (never `select *`) and
 * deliberately omits `cost_price` and `ledgix_item_id` from
 * product_variants, and any internal-only columns. RLS
 * (supabase/migrations/0014_row_level_security.sql) additionally restricts
 * every one of these queries to `status = 'published'` rows regardless of
 * what's requested here — this file's own `.eq('status', 'published')`
 * filters are defense-in-depth on top of that, not the only protection.
 */
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import type { Product, ProductImage, ProductVariant } from '../../backend/lib/types/domain'

interface ProductRow {
  id: string
  brand_id: string | null
  name: string
  slug: string
  short_description: string | null
  description: string | null
  ingredients: string | null
  directions: string | null
  product_type: string | null
  status: 'draft' | 'published' | 'archived'
  is_featured: boolean
  seo_title: string | null
  seo_description: string | null
  published_at: string | null
  attributes: Record<string, unknown> | null
  product_variants: VariantRow[]
  product_images: ImageRow[]
  brands: BrandRelationRow | null
  product_categories: { categories: CategoryRelationRow | null }[] | null
  product_collections: { collections: CollectionRelationRow | null }[] | null
}

interface InventoryCacheRow {
  quantity_available: number
}

interface VariantRow {
  id: string
  product_id: string
  sku: string
  title: string | null
  price: number
  compare_at_price: number | null
  currency: string
  attributes: Record<string, unknown>
  status: 'draft' | 'published' | 'archived'
  /** Phase 9: null when the variant has never been synced (0021_inventory_cache_public_read.sql only exposes a row once one exists). */
  inventory_cache: InventoryCacheRow[] | InventoryCacheRow | null
}

interface ImageRow {
  id: string
  product_id: string
  variant_id: string | null
  storage_path: string
  alt_text: string | null
  sort_order: number
  is_primary: boolean
}

interface BrandRelationRow {
  id: string
  name: string
  slug: string
}

interface CategoryRelationRow {
  id: string
  name: string
  slug: string
}

interface CollectionRelationRow {
  id: string
  name: string
  slug: string
  starts_at: string | null
  ends_at: string | null
}

export interface ProductBrand {
  id: string
  name: string
  slug: string
}

export interface ProductCategoryRef {
  id: string
  name: string
  slug: string
}

export interface ProductCollectionRef {
  id: string
  name: string
  slug: string
  startsAt: string | null
  endsAt: string | null
}

/** Product plus the joined relations the storefront needs to render cards/pages without a second round trip. */
export interface ProductWithRelations extends Product {
  brand: ProductBrand | null
  categories: ProductCategoryRef[]
  collections: ProductCollectionRef[]
}

function mapVariant(row: VariantRow): ProductVariant {
  const cache = Array.isArray(row.inventory_cache) ? row.inventory_cache[0] : row.inventory_cache
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    title: row.title,
    price: row.price,
    compareAtPrice: row.compare_at_price,
    currency: row.currency,
    attributes: row.attributes,
    status: row.status,
    ledgixItemId: null, // never exposed to public reads — see file header
    availableQuantity: cache?.quantity_available ?? null,
  }
}

function mapImage(row: ImageRow): ProductImage {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    storagePath: row.storage_path,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
  }
}

function mapProduct(row: ProductRow): ProductWithRelations {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    description: row.description,
    ingredients: row.ingredients,
    directions: row.directions,
    productType: row.product_type,
    status: row.status,
    isFeatured: row.is_featured,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    publishedAt: row.published_at,
    attributes: row.attributes ?? {},
    variants: (row.product_variants ?? [])
      .filter((v) => v.status === 'published')
      .map(mapVariant),
    images: (row.product_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map(mapImage),
    brand: row.brands ? { id: row.brands.id, name: row.brands.name, slug: row.brands.slug } : null,
    categories: (row.product_categories ?? [])
      .map((pc) => pc.categories)
      .filter((c): c is CategoryRelationRow => Boolean(c))
      .map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    collections: (row.product_collections ?? [])
      .map((pc) => pc.collections)
      .filter((c): c is CollectionRelationRow => Boolean(c))
      .map((c) => ({ id: c.id, name: c.name, slug: c.slug, startsAt: c.starts_at, endsAt: c.ends_at })),
  }
}

// Field-scoped select — see the security note in this file's header before
// adding any new column here. `product_variants`/`product_images` are
// intentionally NOT filtered to status='published' in the query itself
// (mapProduct filters variants client-side) because Supabase's nested
// relation filters would otherwise also need duplicating on every query
// below; RLS already guarantees no draft/archived *product* leaks either
// way.
// Exported ONLY so products.repository.test.ts can assert cost_price/
// ledgix_item_id/internal columns never sneak into this string — nothing
// else should import it, always call the exported list*/get* functions.
export const PRODUCT_SELECT = `
  id, brand_id, name, slug, short_description, description, ingredients, directions, product_type,
  status, is_featured, seo_title, seo_description, published_at, attributes,
  product_variants ( id, product_id, sku, title, price, compare_at_price, currency, attributes, status,
    inventory_cache ( quantity_available )
  ),
  product_images ( id, product_id, variant_id, storage_path, alt_text, sort_order, is_primary ),
  brands ( id, name, slug ),
  product_categories ( categories ( id, name, slug ) ),
  product_collections ( collections ( id, name, slug, starts_at, ends_at ) )
`

async function fetchPublishedProducts(): Promise<ProductWithRelations[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list products: ${error.message}`)
  return ((data ?? []) as unknown as ProductRow[]).map(mapProduct)
}

/** All published products, newest first. */
export async function listPublishedProducts(): Promise<ProductWithRelations[]> {
  return fetchPublishedProducts()
}

export async function getPublishedProductBySlug(slug: string): Promise<ProductWithRelations | null> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'published')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Failed to load product "${slug}": ${error.message}`)
  return data ? mapProduct(data as unknown as ProductRow) : null
}

/** Products with `is_featured = true`, for homepage/curated placements. */
export async function listFeaturedProducts(limit = 8): Promise<ProductWithRelations[]> {
  const all = await fetchPublishedProducts()
  return all.filter((p) => p.isFeatured).slice(0, limit)
}

/** Most recently published products. */
export async function listNewProducts(limit = 8): Promise<ProductWithRelations[]> {
  const all = await fetchPublishedProducts()
  return all
    .slice()
    .sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime())
    .slice(0, limit)
}

/** Products with at least one variant currently on sale (compareAtPrice > price). */
export async function listOnSaleProducts(limit = 8): Promise<ProductWithRelations[]> {
  const all = await fetchPublishedProducts()
  return all
    .filter((p) => p.variants.some((v) => (v.compareAtPrice ?? 0) > v.price))
    .slice(0, limit)
}

export async function listProductsByCategorySlug(categorySlug: string): Promise<ProductWithRelations[]> {
  const all = await fetchPublishedProducts()
  return all.filter((p) => p.categories.some((c) => c.slug === categorySlug))
}

export async function listProductsByBrandSlug(brandSlug: string): Promise<ProductWithRelations[]> {
  const all = await fetchPublishedProducts()
  return all.filter((p) => p.brand?.slug === brandSlug)
}

/** Products in a collection whose campaign window (starts_at/ends_at) is currently active. */
export async function listProductsByCollectionSlug(collectionSlug: string, now: Date = new Date()): Promise<ProductWithRelations[]> {
  const all = await fetchPublishedProducts()
  return all.filter((p) =>
    p.collections.some((c) => {
      if (c.slug !== collectionSlug) return false
      if (c.startsAt && now < new Date(c.startsAt)) return false
      if (c.endsAt && now > new Date(c.endsAt)) return false
      return true
    }),
  )
}

/** Other published products sharing at least one category with `product`, for "related products" rails. */
export async function listRelatedProducts(product: ProductWithRelations, limit = 4): Promise<ProductWithRelations[]> {
  const all = await fetchPublishedProducts()
  const categorySlugs = new Set(product.categories.map((c) => c.slug))
  const related = all.filter(
    (p) => p.id !== product.id && (categorySlugs.size === 0 || p.categories.some((c) => categorySlugs.has(c.slug))),
  )
  return related.slice(0, limit)
}
