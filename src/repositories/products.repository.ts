/**
 * Thin data-access wrapper around Supabase for published catalog reads.
 *
 * NOT wired into any page/component yet — Phase 1 is foundation only. The
 * live storefront still reads from src/data/products.js exactly as before
 * (see apps/web/README.md and docs/phase-1-backend-foundation.md "Existing
 * Frontend Impact"). Phase 3 (Product Management & Product Display Engine)
 * is where UI components switch to calling this repository instead.
 *
 * Every Supabase call for products/catalog data belongs here — components
 * must never call `getSupabaseBrowserClient()` / `.from('products')`
 * directly, so there is exactly one place that knows the table/column
 * shape and can evolve it without touching UI code.
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
  status: 'draft' | 'published' | 'archived'
  is_featured: boolean
  product_variants: VariantRow[]
  product_images: ImageRow[]
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
  ledgix_item_id: string | null
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

function mapVariant(row: VariantRow): ProductVariant {
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
    ledgixItemId: row.ledgix_item_id,
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

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    description: row.description,
    status: row.status,
    isFeatured: row.is_featured,
    variants: (row.product_variants ?? []).map(mapVariant),
    images: (row.product_images ?? []).map(mapImage),
  }
}

const PRODUCT_SELECT = `
  id, brand_id, name, slug, short_description, description, status, is_featured,
  product_variants ( id, product_id, sku, title, price, compare_at_price, currency, attributes, status, ledgix_item_id ),
  product_images ( id, product_id, variant_id, storage_path, alt_text, sort_order, is_primary )
`

export async function listPublishedProducts(): Promise<Product[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list products: ${error.message}`)
  return ((data ?? []) as unknown as ProductRow[]).map(mapProduct)
}

export async function getPublishedProductBySlug(slug: string): Promise<Product | null> {
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
