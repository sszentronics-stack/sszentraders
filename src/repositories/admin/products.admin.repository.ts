/**
 * Admin product data access. Reads go directly to Supabase using the
 * signed-in admin's own session — RLS's `products_admin_all` /
 * `product_variants_admin_all` / `product_images_admin_all` policies
 * (0014_row_level_security.sql) already grant an `is_admin()` caller full
 * read (and write) access to every status, not just `published`, so this
 * is the same "RLS-scoped repository read" pattern as
 * src/repositories/products.repository.ts — just a different, admin-only
 * query shape. This file's own writes/mutations, however, deliberately go
 * through the `products`/`catalog` Edge Functions instead of direct table
 * writes, so every mutation is re-verified by requireAdmin() server-side
 * and audited (see supabase/functions/products/index.ts) rather than
 * relying on RLS alone.
 */
import { getSupabaseBrowserClient } from '../../lib/supabase/client'
import { callEdgeFunction } from '../../lib/supabase/functions'
import type { CreateProductInput, UpdateProductInput, ProductVariantInput, UpdateVariantInput, ProductImageInput, ReorderImagesInput } from '../../../backend/lib/validation/index'

export interface AdminProductListItem {
  id: string
  name: string
  slug: string
  status: 'draft' | 'published' | 'archived'
  isFeatured: boolean
  brandName: string | null
  variantCount: number
  primaryImagePath: string | null
  createdAt: string
}

const LIST_SELECT = `
  id, name, slug, status, is_featured, created_at,
  brands ( name ),
  product_variants ( id ),
  product_images ( storage_path, is_primary )
`

export async function listAdminProducts(params: { search?: string; status?: string; limit?: number; offset?: number } = {}): Promise<{ items: AdminProductListItem[]; total: number }> {
  const client = getSupabaseBrowserClient()
  const limit = params.limit ?? 25
  const offset = params.offset ?? 0
  let query = client.from('products').select(LIST_SELECT, { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (params.status) query = query.eq('status', params.status)
  if (params.search) query = query.ilike('name', `%${params.search}%`)

  const { data, error, count } = await query
  if (error) throw new Error(`Failed to list products: ${error.message}`)

  const items = ((data ?? []) as any[]).map((row) => {
    const images = (row.product_images ?? []) as { storage_path: string; is_primary: boolean }[]
    const primary = images.find((i) => i.is_primary) ?? images[0]
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      isFeatured: row.is_featured,
      brandName: row.brands?.name ?? null,
      variantCount: (row.product_variants ?? []).length,
      primaryImagePath: primary?.storage_path ?? null,
      createdAt: row.created_at,
    }
  })

  return { items, total: count ?? items.length }
}

const DETAIL_SELECT = `
  id, brand_id, name, slug, short_description, description, ingredients, directions, product_type,
  status, is_featured, seo_title, seo_description, published_at, attributes,
  product_variants ( id, product_id, sku, title, price, compare_at_price, currency, attributes, status, weight, weight_unit ),
  product_images ( id, product_id, variant_id, storage_path, alt_text, sort_order, is_primary ),
  brands ( id, name, slug ),
  product_categories ( category_id ),
  product_collections ( collection_id )
`

export async function getAdminProduct(id: string): Promise<any | null> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client.from('products').select(DETAIL_SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load product: ${error.message}`)
  return data
}

// --- Mutations: always via the admin-gated, audited Edge Function ---

export function createProduct(input: CreateProductInput) {
  return callEdgeFunction<{ productId: string; slug: string }>('products', { method: 'POST', body: input })
}

export function updateProduct(id: string, input: UpdateProductInput) {
  return callEdgeFunction<{ productId: string }>(`products/${id}`, { method: 'PATCH', body: input })
}

export function setProductStatus(id: string, action: 'publish' | 'unpublish' | 'archive') {
  return callEdgeFunction<{ productId: string; status: string }>(`products/${id}/${action}`, { method: 'POST' })
}

export function addVariant(productId: string, input: ProductVariantInput) {
  return callEdgeFunction<{ variantId: string }>(`products/${productId}/variants`, { method: 'POST', body: input })
}

export function updateVariant(productId: string, variantId: string, input: UpdateVariantInput) {
  return callEdgeFunction<{ variantId: string }>(`products/${productId}/variants/${variantId}`, { method: 'PATCH', body: input })
}

export function archiveVariant(productId: string, variantId: string) {
  return callEdgeFunction<{ variantId: string }>(`products/${productId}/variants/${variantId}/archive`, { method: 'POST' })
}

export function requestImageUploadUrl(productId: string, input: { variantId?: string; fileName: string; mimeType: string; sizeBytes: number }) {
  return callEdgeFunction<{ path: string; signedUrl: string; token: string }>(`products/${productId}/images/upload-url`, { method: 'POST', body: input })
}

export async function uploadProductImageFile(path: string, token: string, file: File): Promise<void> {
  const client = getSupabaseBrowserClient()
  const { error } = await client.storage.from('product-images').uploadToSignedUrl(path, token, file)
  if (error) throw new Error(`Failed to upload image: ${error.message}`)
}

export function recordProductImage(productId: string, input: ProductImageInput) {
  return callEdgeFunction<{ imageId: string }>(`products/${productId}/images`, { method: 'POST', body: input })
}

export function reorderProductImages(productId: string, input: ReorderImagesInput) {
  return callEdgeFunction<{ productId: string }>(`products/${productId}/images/reorder`, { method: 'PATCH', body: input })
}

export function setPrimaryProductImage(productId: string, imageId: string) {
  return callEdgeFunction<{ imageId: string }>(`products/${productId}/images/${imageId}/primary`, { method: 'POST' })
}

export function removeProductImage(productId: string, imageId: string) {
  return callEdgeFunction<{ imageId: string }>(`products/${productId}/images/${imageId}`, { method: 'DELETE' })
}
