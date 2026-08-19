/**
 * Thin wrapper around the `cart` Edge Function's /recently-viewed routes
 * (backend/services/cart/recentlyViewed.service.ts). See
 * cart.repository.ts's header — same auth/identity model, same
 * "only used when Supabase is configured" rule.
 */
import { callEdgeFunction } from '../lib/supabase/functions'

export interface RecentlyViewedSummary {
  productId: string
  productName: string
  productSlug: string
  price: number | null // minor units
  compareAtPrice: number | null // minor units
  imagePath: string | null
  viewedAt: string
}

export async function listRecentlyViewed(): Promise<RecentlyViewedSummary[]> {
  const { items } = await callEdgeFunction<{ items: RecentlyViewedSummary[] }>('cart/recently-viewed', { method: 'GET' })
  return items
}

export function recordRecentlyViewed(productId: string): Promise<void> {
  return callEdgeFunction('cart/recently-viewed', { method: 'POST', body: { productId } })
}
