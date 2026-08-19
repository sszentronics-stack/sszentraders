/**
 * Thin wrapper around the `cart` Edge Function (backend/services/cart) —
 * the only place components/context should reach for server-backed cart
 * state. Every call here is authenticated by the caller's Supabase Auth
 * session (signed-in OR anonymous-auth guest — see
 * src/context/AuthContext.jsx's ensureGuestSession), and every response is
 * a server-computed CartSummary: totals are never assembled client-side
 * from a locally-held price.
 *
 * Only used when isSupabaseConfigured() — see src/context/CartContext.jsx
 * for the localStorage fallback used otherwise, unchanged from Phase 3.
 */
import { callEdgeFunction } from '../lib/supabase/functions'

export interface CartSummaryItem {
  itemId: string
  variantId: string
  productId: string
  productName: string
  productSlug: string
  variantTitle: string | null
  sku: string
  quantity: number
  unitPrice: number // minor units
  compareAtPrice: number | null
  lineTotal: number // minor units
  currency: string
  imagePath: string | null
  priceChanged: boolean
  /** True when Phase 9's inventory sync reduced this line's quantity to what's actually available. */
  quantityAdjusted: boolean
}

export interface CartSummary {
  cartId: string | null
  currency: string
  items: CartSummaryItem[]
  subtotal: number // minor units
  removedItems: { itemId: string; reason: 'variant_unavailable' | 'product_unavailable' | 'out_of_stock' }[]
}

export function getCart(): Promise<CartSummary> {
  return callEdgeFunction<CartSummary>('cart', { method: 'GET' })
}

export function addCartItem(variantId: string, quantity = 1): Promise<CartSummary> {
  return callEdgeFunction<CartSummary>('cart/items', { method: 'POST', body: { variantId, quantity } })
}

export function updateCartItemQuantity(itemId: string, quantity: number): Promise<CartSummary> {
  return callEdgeFunction<CartSummary>(`cart/items/${itemId}`, { method: 'PATCH', body: { quantity } })
}

export function removeCartItem(itemId: string): Promise<CartSummary> {
  return callEdgeFunction<CartSummary>(`cart/items/${itemId}`, { method: 'DELETE' })
}

export function clearCart(): Promise<CartSummary> {
  return callEdgeFunction<CartSummary>('cart', { method: 'DELETE' })
}

/** Called once right after a guest becomes authenticated — see CartContext's login/register merge flow. */
export function mergeCart(items: { variantId: string; quantity: number }[]): Promise<CartSummary> {
  return callEdgeFunction<CartSummary>('cart/merge', { method: 'POST', body: { items } })
}
