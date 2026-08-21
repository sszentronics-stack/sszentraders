/**
 * Thin wrapper around the `cart` Edge Function's /wishlist routes
 * (backend/services/cart/wishlist.service.ts). See cart.repository.ts's
 * header — same auth/identity model, same "only used when Supabase is
 * configured" rule.
 */
import { callEdgeFunction } from '../lib/supabase/functions'

export interface WishlistItemSummary {
  itemId: string
  productId: string
  productName: string
  productSlug: string
  price: number | null // minor units
  compareAtPrice: number | null // minor units
  imagePath: string | null
  addedAt: string
}

interface WishlistResponse {
  items: WishlistItemSummary[]
}

export async function listWishlist(): Promise<WishlistItemSummary[]> {
  const { items } = await callEdgeFunction<WishlistResponse>('cart/wishlist', { method: 'GET' })
  return items
}

export async function addToWishlist(productId: string): Promise<WishlistItemSummary[]> {
  const { items } = await callEdgeFunction<WishlistResponse>('cart/wishlist', { method: 'POST', body: { productId } })
  return items
}

export async function removeFromWishlist(productId: string): Promise<WishlistItemSummary[]> {
  const { items } = await callEdgeFunction<WishlistResponse>(`cart/wishlist/${productId}`, { method: 'DELETE' })
  return items
}
