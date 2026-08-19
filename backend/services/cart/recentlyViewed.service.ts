/**
 * Recently-viewed persistence — a lightweight signal, capped per profile
 * ("privacy-conscious limits" per the Phase 5 spec) rather than an
 * unbounded history table. Same ownership/authorization contract as
 * cart.service.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { trimToMostRecent } from '../../lib/cart'

export const RECENTLY_VIEWED_LIMIT = 12

const RECENTLY_VIEWED_SELECT = `
  id, product_id, viewed_at,
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
interface RecentlyViewedRow {
  id: string
  product_id: string
  viewed_at: string
  products: ProductJoinRow | null
}

export interface RecentlyViewedSummary {
  productId: string
  productName: string
  productSlug: string
  price: number | null
  compareAtPrice: number | null
  imagePath: string | null
  viewedAt: string
}

function primaryImagePath(images: ImageRow[] | null | undefined): string | null {
  if (!images || images.length === 0) return null
  const sorted = images.slice().sort((a, b) => a.sort_order - b.sort_order)
  return (sorted.find((i) => i.is_primary) ?? sorted[0])!.storage_path
}

/** Record a product view and trim the profile's history down to RECENTLY_VIEWED_LIMIT, most recent first. */
export async function recordRecentlyViewed(db: SupabaseClient, profileId: string, productId: string): Promise<void> {
  const { error } = await db
    .from('recently_viewed')
    .upsert(
      { profile_id: profileId, product_id: productId, viewed_at: new Date().toISOString() },
      { onConflict: 'profile_id,product_id' },
    )
  if (error) throw error

  const { data, error: listError } = await db.from('recently_viewed').select('id, viewed_at').eq('profile_id', profileId)
  if (listError) throw listError

  const rows = (data ?? []).map((r) => ({ id: r.id as string, viewedAt: r.viewed_at as string }))
  if (rows.length <= RECENTLY_VIEWED_LIMIT) return

  const keepIds = new Set(trimToMostRecent(rows, RECENTLY_VIEWED_LIMIT).map((r) => r.id))
  const staleIds = rows.filter((r) => !keepIds.has(r.id)).map((r) => r.id)
  if (staleIds.length > 0) await db.from('recently_viewed').delete().in('id', staleIds)
}

export async function listRecentlyViewed(db: SupabaseClient, profileId: string): Promise<RecentlyViewedSummary[]> {
  const { data, error } = await db
    .from('recently_viewed')
    .select(RECENTLY_VIEWED_SELECT)
    .eq('profile_id', profileId)
    .order('viewed_at', { ascending: false })
    .limit(RECENTLY_VIEWED_LIMIT)
  if (error) throw error

  const rows = (data ?? []) as unknown as RecentlyViewedRow[]
  const staleIds: string[] = []
  const items: RecentlyViewedSummary[] = []

  for (const row of rows) {
    const product = row.products
    if (!product || product.status !== 'published') {
      staleIds.push(row.id)
      continue
    }
    const publishedVariant = (product.product_variants ?? []).find((v) => v.status === 'published') ?? null
    items.push({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      price: publishedVariant?.price ?? null,
      compareAtPrice: publishedVariant?.compare_at_price ?? null,
      imagePath: primaryImagePath(product.product_images),
      viewedAt: row.viewed_at,
    })
  }

  if (staleIds.length > 0) await db.from('recently_viewed').delete().in('id', staleIds)

  return items
}
