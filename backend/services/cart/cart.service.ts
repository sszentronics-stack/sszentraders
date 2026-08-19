/**
 * Cart service — the write/read path for a profile's active cart. Called
 * ONLY from supabase/functions/cart/index.ts (service-role client), after
 * that function has resolved the caller's profileId via
 * supabase/functions/_shared/callerAuth.ts. Nothing here performs its own
 * authentication — every function trusts the `profileId` it's given, so
 * callers must always pass the caller's OWN resolved profileId, never one
 * read from a request body.
 *
 * Every price/total returned to the client is recomputed here from the
 * live product_variants row via backend/lib/cart's pure revalidation logic
 * — a client-supplied price is never an input to any function below. See
 * that module's header for the full rationale.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeCartSubtotal, mergeCartLines, revalidateCartLine, type CartLineInput } from '../../lib/cart/index.ts'
import { NotFoundError, ValidationError } from '../../lib/errors/index.ts'
import { getAvailabilityForVariants } from '../inventory/inventory.service.ts'

const CART_ITEM_SELECT = `
  id, variant_id, quantity, unit_price_snapshot, added_at,
  product_variants (
    id, sku, title, price, compare_at_price, currency, status, product_id,
    products ( id, name, slug, status,
      product_images ( storage_path, is_primary, sort_order )
    )
  )
`

interface ImageRow {
  storage_path: string
  is_primary: boolean
  sort_order: number
}
interface ProductJoinRow {
  id: string
  name: string
  slug: string
  status: string
  product_images: ImageRow[] | null
}
interface VariantJoinRow {
  id: string
  sku: string
  title: string | null
  price: number
  compare_at_price: number | null
  currency: string
  status: string
  product_id: string
  products: ProductJoinRow | null
}
interface CartItemRow {
  id: string
  variant_id: string
  quantity: number
  unit_price_snapshot: number
  added_at: string
  product_variants: VariantJoinRow | null
}

export interface CartSummaryItem {
  itemId: string
  variantId: string
  productId: string
  productName: string
  productSlug: string
  variantTitle: string | null
  sku: string
  quantity: number
  unitPrice: number
  compareAtPrice: number | null
  lineTotal: number
  currency: string
  imagePath: string | null
  priceChanged: boolean
  /** True when the quantity shown was reduced from what was stored because Phase 9's inventory_cache reports less is actually available. */
  quantityAdjusted: boolean
}

export interface CartSummary {
  cartId: string | null
  currency: string
  items: CartSummaryItem[]
  subtotal: number
  removedItems: { itemId: string; reason: 'variant_unavailable' | 'product_unavailable' | 'out_of_stock' }[]
}

function primaryImagePath(images: ImageRow[] | null | undefined): string | null {
  if (!images || images.length === 0) return null
  const sorted = images.slice().sort((a, b) => a.sort_order - b.sort_order)
  return (sorted.find((i) => i.is_primary) ?? sorted[0])!.storage_path
}

async function findActiveCart(db: SupabaseClient, profileId: string) {
  const { data, error } = await db
    .from('carts')
    .select('id, currency')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data as { id: string; currency: string } | null
}

async function recordCartEvent(db: SupabaseClient, cartId: string, eventType: string, metadata?: Record<string, unknown>): Promise<void> {
  await db.from('cart_events').insert({ cart_id: cartId, event_type: eventType, metadata: metadata ?? null })
}

async function getOrCreateActiveCart(db: SupabaseClient, profileId: string): Promise<{ id: string; currency: string }> {
  const existing = await findActiveCart(db, profileId)
  if (existing) return existing

  const { data, error } = await db.from('carts').insert({ profile_id: profileId }).select('id, currency').single()
  if (error) throw error

  await recordCartEvent(db, data.id as string, 'created')
  return data as { id: string; currency: string }
}

async function fetchCartItems(db: SupabaseClient, cartId: string): Promise<CartItemRow[]> {
  const { data, error } = await db.from('cart_items').select(CART_ITEM_SELECT).eq('cart_id', cartId)
  if (error) throw error
  return (data ?? []) as unknown as CartItemRow[]
}

/**
 * Revalidate every line against its live variant/product, silently dropping
 * (and deleting) any line whose variant/product is no longer sellable, and
 * return the resulting summary + subtotal. GET /cart and every mutation
 * route below call this last, so the client always sees server-computed,
 * currently-correct totals — never a stale or client-supplied one.
 */
async function buildSummary(db: SupabaseClient, cart: { id: string; currency: string } | null): Promise<CartSummary> {
  if (!cart) return { cartId: null, currency: 'PKR', items: [], subtotal: 0, removedItems: [] }

  const rows = await fetchCartItems(db, cart.id)
  const items: CartSummaryItem[] = []
  const removedItems: CartSummary['removedItems'] = []
  const staleItemIds: string[] = []

  const variantIds = rows.map((r) => r.variant_id)
  const availability = await getAvailabilityForVariants(db, variantIds)

  for (const row of rows) {
    const variant = row.product_variants
    const snapshot = variant
      ? {
          id: variant.id,
          price: variant.price,
          status: variant.status as 'draft' | 'published' | 'archived',
          productStatus: (variant.products?.status ?? 'archived') as 'draft' | 'published' | 'archived',
          availableQuantity: availability.get(variant.id)?.quantityAvailable ?? null,
        }
      : null

    const result = revalidateCartLine({
      requestedQuantity: row.quantity,
      variant: snapshot,
      previousUnitPrice: row.unit_price_snapshot,
    })

    if (!result.keep) {
      removedItems.push({ itemId: row.id, reason: result.reason })
      staleItemIds.push(row.id)
      continue
    }

    const product = variant!.products!
    items.push({
      itemId: row.id,
      variantId: variant!.id,
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      variantTitle: variant!.title,
      sku: variant!.sku,
      quantity: result.quantity,
      unitPrice: result.unitPrice,
      compareAtPrice: variant!.compare_at_price,
      lineTotal: result.lineTotal,
      currency: variant!.currency,
      imagePath: primaryImagePath(product.product_images),
      priceChanged: result.priceChanged,
      quantityAdjusted: result.quantityAdjusted,
    })

    // Keep the stored snapshot in step with the live price so the NEXT
    // read's priceChanged only reflects a genuinely new change, not the one
    // we just surfaced to this caller.
    if (result.priceChanged || result.quantity !== row.quantity) {
      await db.from('cart_items').update({ quantity: result.quantity, unit_price_snapshot: result.unitPrice }).eq('id', row.id)
    }
  }

  if (staleItemIds.length > 0) {
    await db.from('cart_items').delete().in('id', staleItemIds)
    await recordCartEvent(db, cart.id, 'item_removed', { reason: 'revalidation', itemIds: staleItemIds })
  }

  return { cartId: cart.id, currency: cart.currency, items, subtotal: computeCartSubtotal(items), removedItems }
}

export async function getCartSummary(db: SupabaseClient, profileId: string): Promise<CartSummary> {
  return buildSummary(db, await findActiveCart(db, profileId))
}

/**
 * Called by backend/services/orders/orders.service.ts once an order has
 * been created from this cart — flips it out of `active` so
 * getOrCreateActiveCart() starts a fresh cart next time, while keeping the
 * row (and its cart_events history) intact rather than deleting it.
 */
export async function markCartConverted(db: SupabaseClient, cartId: string): Promise<void> {
  await db.from('carts').update({ status: 'converted' }).eq('id', cartId)
  await recordCartEvent(db, cartId, 'converted')
}

async function fetchVariantSnapshot(db: SupabaseClient, variantId: string) {
  const { data, error } = await db
    .from('product_variants')
    .select('id, price, status, product_id, products ( status )')
    .eq('id', variantId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const products = data.products as { status: string } | { status: string }[] | null
  const productStatus = Array.isArray(products) ? products[0]?.status : products?.status
  const availability = await getAvailabilityForVariants(db, [variantId])
  return {
    id: data.id as string,
    price: data.price as number,
    status: data.status as 'draft' | 'published' | 'archived',
    productStatus: (productStatus ?? 'archived') as 'draft' | 'published' | 'archived',
    availableQuantity: availability.get(variantId)?.quantityAvailable ?? null,
  }
}

export async function addCartItem(db: SupabaseClient, profileId: string, input: CartLineInput): Promise<CartSummary> {
  const snapshot = await fetchVariantSnapshot(db, input.variantId)
  if (!snapshot || snapshot.status !== 'published' || snapshot.productStatus !== 'published') {
    throw new NotFoundError('Product variant', 'This product is not currently available.')
  }
  if (snapshot.availableQuantity != null && snapshot.availableQuantity <= 0) {
    throw new ValidationError('This product is currently out of stock.')
  }

  const cart = await getOrCreateActiveCart(db, profileId)
  const { data: existing } = await db
    .from('cart_items')
    .select('id, quantity')
    .eq('cart_id', cart.id)
    .eq('variant_id', input.variantId)
    .maybeSingle()

  let nextQuantity = Math.min((existing?.quantity ?? 0) + input.quantity, 999)
  // Never let this line exceed real availability — clamp rather than reject
  // outright, so "add 5 when only 3 are left" still adds what's sellable
  // (buildSummary()'s revalidation below would clamp it anyway; doing it
  // here too avoids a pointless insert-then-clamp round trip).
  if (snapshot.availableQuantity != null) nextQuantity = Math.min(nextQuantity, snapshot.availableQuantity)

  if (existing) {
    await db.from('cart_items').update({ quantity: nextQuantity, unit_price_snapshot: snapshot.price }).eq('id', existing.id)
  } else {
    await db
      .from('cart_items')
      .insert({ cart_id: cart.id, variant_id: input.variantId, quantity: nextQuantity, unit_price_snapshot: snapshot.price })
  }
  await recordCartEvent(db, cart.id, 'item_added', { variantId: input.variantId, quantity: input.quantity })

  return buildSummary(db, cart)
}

async function requireOwnedCartItem(db: SupabaseClient, profileId: string, itemId: string) {
  const { data, error } = await db
    .from('cart_items')
    .select('id, cart_id, carts ( id, profile_id, currency )')
    .eq('id', itemId)
    .maybeSingle()
  if (error) throw error
  const cart = (Array.isArray(data?.carts) ? data?.carts[0] : data?.carts) as
    | { id: string; profile_id: string; currency: string }
    | undefined
  if (!data || !cart || cart.profile_id !== profileId) throw new NotFoundError('Cart item')
  return { itemId: data.id as string, cart: { id: cart.id, currency: cart.currency } }
}

export async function updateCartItemQuantity(
  db: SupabaseClient,
  profileId: string,
  itemId: string,
  quantity: number,
): Promise<CartSummary> {
  if (quantity < 1) throw new ValidationError('Quantity must be at least 1.')
  const { cart } = await requireOwnedCartItem(db, profileId, itemId)
  await db.from('cart_items').update({ quantity: Math.min(quantity, 999) }).eq('id', itemId)
  await recordCartEvent(db, cart.id, 'item_updated', { itemId, quantity })
  return buildSummary(db, cart)
}

export async function removeCartItem(db: SupabaseClient, profileId: string, itemId: string): Promise<CartSummary> {
  const { cart } = await requireOwnedCartItem(db, profileId, itemId)
  await db.from('cart_items').delete().eq('id', itemId)
  await recordCartEvent(db, cart.id, 'item_removed', { itemId })
  return buildSummary(db, cart)
}

export async function clearCart(db: SupabaseClient, profileId: string): Promise<CartSummary> {
  const cart = await findActiveCart(db, profileId)
  if (!cart) return { cartId: null, currency: 'PKR', items: [], subtotal: 0, removedItems: [] }
  await db.from('cart_items').delete().eq('cart_id', cart.id)
  await recordCartEvent(db, cart.id, 'cleared')
  return buildSummary(db, cart)
}

/**
 * Merge a guest cart's lines (captured client-side just before the same
 * browser session becomes authenticated — see src/context/CartContext.jsx)
 * into the now-current profile's cart. Deterministic: quantities for the
 * same variant are summed via backend/lib/cart's mergeCartLines, never
 * duplicated as separate lines, and every line is still revalidated by the
 * final buildSummary() before it reaches the client. A variant that's gone
 * unavailable since the guest added it is simply skipped rather than
 * merged in stale.
 */
export async function mergeCartItems(db: SupabaseClient, profileId: string, incoming: CartLineInput[]): Promise<CartSummary> {
  if (incoming.length === 0) return getCartSummary(db, profileId)

  const cart = await getOrCreateActiveCart(db, profileId)
  const { data: existingRows, error } = await db.from('cart_items').select('variant_id, quantity').eq('cart_id', cart.id)
  if (error) throw error

  const existing: CartLineInput[] = (existingRows ?? []).map((r) => ({
    variantId: r.variant_id as string,
    quantity: r.quantity as number,
  }))
  const merged = mergeCartLines(existing, incoming)

  for (const line of merged) {
    const snapshot = await fetchVariantSnapshot(db, line.variantId)
    if (!snapshot || snapshot.status !== 'published' || snapshot.productStatus !== 'published') continue
    await db
      .from('cart_items')
      .upsert(
        { cart_id: cart.id, variant_id: line.variantId, quantity: line.quantity, unit_price_snapshot: snapshot.price },
        { onConflict: 'cart_id,variant_id' },
      )
  }
  await recordCartEvent(db, cart.id, 'merged', { lineCount: incoming.length })

  return buildSummary(db, cart)
}

// ---------------------------------------------------------------------------
// Phase 13 — reorder: re-add a past order's items to the CURRENT cart,
// checking today's availability/price rather than blindly replaying the
// order's old price/quantity snapshot (phase spec: "checking current
// availability/price, not blindly re-using the old snapshot"). Reuses
// addCartItem()'s own snapshot/availability/clamping logic per line rather
// than re-deriving it, so a reordered line behaves exactly like a normal
// "add to cart" would today.
// ---------------------------------------------------------------------------

export interface ReorderResult {
  cart: CartSummary
  addedCount: number
  skipped: { productName: string; sku: string; reason: 'unavailable' | 'out_of_stock' }[]
}

/** Ownership-checked: only re-adds items from an order that belongs to this profile's own customer record. */
export async function reorderToCart(db: SupabaseClient, profileId: string, orderId: string): Promise<ReorderResult> {
  const { data: customer } = await db.from('customers').select('id').eq('profile_id', profileId).maybeSingle()
  if (!customer) throw new NotFoundError('Order')

  const { data: order } = await db.from('orders').select('id, customer_id').eq('id', orderId).maybeSingle()
  if (!order || order.customer_id !== customer.id) throw new NotFoundError('Order')

  const { data: items, error } = await db
    .from('order_items')
    .select('variant_id, sku, product_name, quantity')
    .eq('order_id', orderId)
  if (error) throw error

  const skipped: ReorderResult['skipped'] = []
  let addedCount = 0

  for (const item of (items ?? []) as { variant_id: string | null; sku: string; product_name: string; quantity: number }[]) {
    if (!item.variant_id) {
      skipped.push({ productName: item.product_name, sku: item.sku, reason: 'unavailable' })
      continue
    }
    try {
      await addCartItem(db, profileId, { variantId: item.variant_id, quantity: item.quantity })
      addedCount += 1
    } catch (err) {
      const reason = err instanceof ValidationError ? 'out_of_stock' : 'unavailable'
      skipped.push({ productName: item.product_name, sku: item.sku, reason })
    }
  }

  return { cart: await getCartSummary(db, profileId), addedCount, skipped }
}
