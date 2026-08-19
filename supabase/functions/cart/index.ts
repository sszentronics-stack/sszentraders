/**
 * cart — Phase 5 (Persistent Cart, Wishlist & Shopping State).
 *
 * Every route requires a caller JWT (signed-in OR anonymous-auth guest —
 * see ../_shared/callerAuth.ts) and operates on THAT caller's own cart/
 * wishlist/recently-viewed rows only; there is no way to address another
 * profile's data through this function. Totals are always server-computed
 * from the live catalog (backend/services/cart/cart.service.ts) — a
 * client-supplied price/total is never accepted as input anywhere below.
 *
 * Routing is a minimal manual switch on `${method} ${pathname}`, matching
 * the pattern established in ../products/index.ts:
 *
 *   GET    /                        cart summary (items + subtotal)
 *   POST   /items                   add an item {variantId, quantity}
 *   PATCH  /items/:itemId           update an item's quantity {quantity}
 *   DELETE /items/:itemId           remove one item
 *   DELETE /                        clear the cart
 *   POST   /merge                   merge guest lines into the current cart
 *                                    {items:[{variantId,quantity}]} — called
 *                                    once right after login/registration
 *   POST   /reorder/:orderId        re-add a past order's items to the
 *                                    current cart, re-checked against live
 *                                    price/availability (Phase 13)
 *   GET    /wishlist                list saved products
 *   POST   /wishlist                save a product {productId}
 *   DELETE /wishlist/:productId     remove a saved product
 *   GET    /recently-viewed         list recently viewed products
 *   POST   /recently-viewed         record a product view {productId}
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireCallerProfile } from '../_shared/callerAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { NotFoundError } from '../../../backend/lib/errors/index.ts'
import {
  cartItemInputSchema,
  mergeCartItemsSchema,
  parseOrThrow,
  recentlyViewedInputSchema,
  updateCartItemQuantitySchema,
  wishlistItemInputSchema,
} from '../../../backend/lib/validation/index.ts'
import * as cart from '../../../backend/services/cart/cart.service.ts'
import * as wishlist from '../../../backend/services/cart/wishlist.service.ts'
import * as recentlyViewed from '../../../backend/services/cart/recentlyViewed.service.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    // Supabase invokes this as /functions/v1/cart/<rest>; strip the
    // function name so routing below only deals with the part after it.
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?cart\/?/, '').split('/').filter(Boolean)
    const admin = getSupabaseAdminClient()
    const body = await req.json().catch(() => ({}))

    // Every route needs the caller's profile; resolve it once.
    const caller = await requireCallerProfile(req)

    if (segments[0] === 'items') {
      if (req.method === 'POST' && segments.length === 1) {
        const input = parseOrThrow(cartItemInputSchema, body)
        return okResponse(await cart.addCartItem(admin, caller.id, input), 201)
      }
      const [, itemId] = segments
      if (!itemId) throw new NotFoundError('Route')
      if (req.method === 'PATCH') {
        const input = parseOrThrow(updateCartItemQuantitySchema, body)
        return okResponse(await cart.updateCartItemQuantity(admin, caller.id, itemId, input.quantity))
      }
      if (req.method === 'DELETE') {
        return okResponse(await cart.removeCartItem(admin, caller.id, itemId))
      }
    }

    if (segments[0] === 'merge' && req.method === 'POST') {
      const input = parseOrThrow(mergeCartItemsSchema, body)
      return okResponse(await cart.mergeCartItems(admin, caller.id, input.items))
    }

    if (segments[0] === 'reorder' && req.method === 'POST') {
      const [, orderId] = segments
      if (!orderId) throw new NotFoundError('Route')
      return okResponse(await cart.reorderToCart(admin, caller.id, orderId))
    }

    if (segments[0] === 'wishlist') {
      if (req.method === 'GET' && segments.length === 1) {
        return okResponse({ items: await wishlist.listWishlist(admin, caller.id) })
      }
      if (req.method === 'POST' && segments.length === 1) {
        const input = parseOrThrow(wishlistItemInputSchema, body)
        await wishlist.addToWishlist(admin, caller.id, input.productId)
        return okResponse({ items: await wishlist.listWishlist(admin, caller.id) }, 201)
      }
      const [, productId] = segments
      if (req.method === 'DELETE' && productId) {
        await wishlist.removeFromWishlist(admin, caller.id, productId)
        return okResponse({ items: await wishlist.listWishlist(admin, caller.id) })
      }
    }

    if (segments[0] === 'recently-viewed') {
      if (req.method === 'GET') {
        return okResponse({ items: await recentlyViewed.listRecentlyViewed(admin, caller.id) })
      }
      if (req.method === 'POST') {
        const input = parseOrThrow(recentlyViewedInputSchema, body)
        await recentlyViewed.recordRecentlyViewed(admin, caller.id, input.productId)
        return okResponse({ ok: true }, 201)
      }
    }

    if (segments.length === 0) {
      if (req.method === 'GET') return okResponse(await cart.getCartSummary(admin, caller.id))
      if (req.method === 'DELETE') return okResponse(await cart.clearCart(admin, caller.id))
    }

    throw new NotFoundError('route', 'No matching route for this method/path on the cart function.')
  }),
)
