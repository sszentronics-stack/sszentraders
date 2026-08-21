/**
 * Wishlist service — persistence for a profile's saved products. Same
 * ownership/authorization contract as cart.service.ts: called only from
 * supabase/functions/cart/index.ts with an already-resolved profileId.
 *
 * Revalidated at read time (not write time): a product can go from
 * published to draft/archived after it was saved, and listWishlist()
 * quietly drops (and deletes) that row rather than showing a broken entry,
 * matching the spec's "graceful guest behavior" / no dead-end UI rule.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFoundError } from '../../lib/errors/index.ts'

const WISHLIST_SELECT = `
  id, product_id, created_at,
  products (
    id, name, slug, status,
    product_variants ( id, price, compare_at_price, status ),
    product_images ( storage_path, is_primary, sort_order )
  )
`

interface ImageRow {
  storage_path: string
  is_primary: boolean
  sort_order: number
}
interface VariantRow {
  id: string
  price: number
  compare_at_price: number | null
  status: string
}
interface ProductJoinRow {
  id: string
  name: string
  slug: string
  status: string
  product_variants: VariantRow[] | null
  product_images: ImageRow[] | null
}
interface WishlistRow {
  id: string
  product_id: string
  created_at: string
  products: ProductJoinRow | null
}

export interface WishlistItemSummary {
  itemId: string
  productId: string
  productName: string
  productSlug: string
  price: number | null
  compareAtPrice: number | null
  imagePath: string | null
  addedAt: string
}

function primaryImagePath(images: ImageRow[] | null | undefined): string | null {
  if (!images || images.length === 0) return null
  const sorted = images.slice().sort((a, b) => a.sort_order - b.sort_order)
  return (sorted.find((i) => i.is_primary) ?? sorted[0])!.storage_path
}

export async function listWishlist(db: SupabaseClient, profileId: string): Promise<WishlistItemSummary[]> {
  const { data, error } = await db
    .from('wishlist_items')
    .select(WISHLIST_SELECT)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as unknown as WishlistRow[]
  const staleIds: string[] = []
  const items: WishlistItemSummary[] = []

  for (const row of rows) {
    const product = row.products
    if (!product || product.status !== 'published') {
      staleIds.push(row.id)
      continue
    }
    const publishedVariant = (product.product_variants ?? []).find((v) => v.status === 'published') ?? null
    items.push({
      itemId: row.id,
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      price: publishedVariant?.price ?? null,
      compareAtPrice: publishedVariant?.compare_at_price ?? null,
      imagePath: primaryImagePath(product.product_images),
      addedAt: row.created_at,
    })
  }

  if (staleIds.length > 0) {
    await db.from('wishlist_items').delete().in('id', staleIds)
  }

  return items
}

export async function addToWishlist(db: SupabaseClient, profileId: string, productId: string): Promise<void> {
  const { data: product, error } = await db.from('products').select('id, status').eq('id', productId).maybeSingle()
  if (error) throw error
  if (!product || product.status !== 'published') throw new NotFoundError('Product')

  const { error: insertError } = await db
    .from('wishlist_items')
    .upsert({ profile_id: profileId, product_id: productId }, { onConflict: 'profile_id,product_id', ignoreDuplicates: true })
  if (insertError) throw insertError
}

export async function removeFromWishlist(db: SupabaseClient, profileId: string, productId: string): Promise<void> {
  const { error } = await db.from('wishlist_items').delete().eq('profile_id', profileId).eq('product_id', productId)
  if (error) throw error
}
