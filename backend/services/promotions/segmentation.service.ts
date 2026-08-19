/**
 * Customer segmentation and abandoned-cart queries — Phase 13. Every number
 * here is computed from real order/cart data, never invented (phase spec:
 * "do not invent financial values from analytics"). Deliberately query
 * functions, not a UI dashboard (that's Phase 15's job) — consumed by the
 * promotions engine (first-order eligibility) and by the admin promotions
 * UI's read-only segment counts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Exported so other read-only reporting (Phase 15's commerce analytics) can reuse the same "what counts as a real order" vocabulary instead of redefining it. */
export const COMPLETED_ORDER_STATUSES = ['delivered', 'returned', 'refunded'] as const
/** Any order that isn't cancelled counts toward "has this customer ordered before" for first-order-offer eligibility — a cancelled order was never fulfilled. */
export const COUNTS_TOWARD_ORDER_HISTORY = ['pending', 'confirmed', 'processing', 'packed', 'ready_for_pickup', 'shipped', ...COMPLETED_ORDER_STATUSES]

export interface CustomerOrderStats {
  orderCount: number
  completedOrderCount: number
  totalSpent: number // minor units, across non-cancelled orders
  firstOrderAt: string | null
  lastOrderAt: string | null
}

export async function getCustomerOrderStats(db: SupabaseClient, customerId: string): Promise<CustomerOrderStats> {
  const { data, error } = await db
    .from('orders')
    .select('order_status, grand_total, placed_at')
    .eq('customer_id', customerId)
    .in('order_status', COUNTS_TOWARD_ORDER_HISTORY)
    .order('placed_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as { order_status: string; grand_total: number; placed_at: string }[]
  const completed = rows.filter((r) => (COMPLETED_ORDER_STATUSES as readonly string[]).includes(r.order_status))

  return {
    orderCount: rows.length,
    completedOrderCount: completed.length,
    totalSpent: rows.reduce((sum, r) => sum + r.grand_total, 0),
    firstOrderAt: rows[0]?.placed_at ?? null,
    lastOrderAt: rows[rows.length - 1]?.placed_at ?? null,
  }
}

/** Used by the promotions engine's first_order_only eligibility check — true when this customer has no prior (non-cancelled) order at all. */
export async function isFirstOrderCustomer(db: SupabaseClient, customerId: string): Promise<boolean> {
  const stats = await getCustomerOrderStats(db, customerId)
  return stats.orderCount === 0
}

export type CustomerSegment = 'new' | 'returning' | 'vip' | 'inactive'

/** Total spend threshold (minor units) or order count at which a customer is considered VIP. Documented constants, not invented per-call. */
export const VIP_TOTAL_SPENT_THRESHOLD = 5_000_000 // Rs. 50,000
export const VIP_ORDER_COUNT_THRESHOLD = 5
/** A customer with no order in this many days (and at least one past order) is considered inactive. */
export const INACTIVE_DAYS_THRESHOLD = 90

export interface CustomerSegmentSummary {
  segment: CustomerSegment
  stats: CustomerOrderStats
  /** Average days between consecutive completed orders, or null if fewer than 2. */
  repeatPurchaseIntervalDays: number | null
  favouriteCategorySlug: string | null
}

async function computeRepeatPurchaseIntervalDays(db: SupabaseClient, customerId: string): Promise<number | null> {
  const { data, error } = await db
    .from('orders')
    .select('placed_at')
    .eq('customer_id', customerId)
    .in('order_status', COMPLETED_ORDER_STATUSES as unknown as string[])
    .order('placed_at', { ascending: true })
  if (error) throw error
  const dates = (data ?? []).map((r) => new Date(r.placed_at as string).getTime())
  if (dates.length < 2) return null

  const gaps: number[] = []
  for (let i = 1; i < dates.length; i++) gaps.push((dates[i]! - dates[i - 1]!) / (1000 * 60 * 60 * 24))
  return Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 10) / 10
}

async function computeFavouriteCategorySlug(db: SupabaseClient, customerId: string): Promise<string | null> {
  const { data: orderRows, error: orderError } = await db.from('orders').select('id').eq('customer_id', customerId)
  if (orderError) throw orderError
  const orderIds = (orderRows ?? []).map((r) => r.id as string)
  if (orderIds.length === 0) return null

  const { data: itemRows, error: itemError } = await db
    .from('order_items')
    .select('product_id')
    .in('order_id', orderIds)
    .not('product_id', 'is', null)
  if (itemError) throw itemError
  const productIds = [...new Set((itemRows ?? []).map((r) => r.product_id as string))]
  if (productIds.length === 0) return null

  const { data: categoryRows, error: categoryError } = await db
    .from('product_categories')
    .select('category_id, categories ( slug )')
    .in('product_id', productIds)
  if (categoryError) throw categoryError

  const counts = new Map<string, number>()
  for (const row of categoryRows ?? []) {
    const category = row.categories as { slug: string } | { slug: string }[] | null
    const slug = Array.isArray(category) ? category[0]?.slug : category?.slug
    if (!slug) continue
    counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
}

/** Full segmentation read for one customer — real order data only, no invented numbers. */
export async function classifyCustomer(db: SupabaseClient, customerId: string): Promise<CustomerSegmentSummary> {
  const stats = await getCustomerOrderStats(db, customerId)
  const [repeatPurchaseIntervalDays, favouriteCategorySlug] = await Promise.all([
    computeRepeatPurchaseIntervalDays(db, customerId),
    computeFavouriteCategorySlug(db, customerId),
  ])

  let segment: CustomerSegment = 'new'
  if (stats.orderCount === 0) {
    segment = 'new'
  } else if (stats.totalSpent >= VIP_TOTAL_SPENT_THRESHOLD || stats.orderCount >= VIP_ORDER_COUNT_THRESHOLD) {
    segment = 'vip'
  } else if (
    stats.lastOrderAt &&
    (Date.now() - new Date(stats.lastOrderAt).getTime()) / (1000 * 60 * 60 * 24) > INACTIVE_DAYS_THRESHOLD
  ) {
    segment = 'inactive'
  } else {
    segment = 'returning'
  }

  return { segment, stats, repeatPurchaseIntervalDays, favouriteCategorySlug }
}

export interface AbandonedCartRow {
  cartId: string
  profileId: string
  itemCount: number
  subtotalHint: number // minor units, sum of stored unit_price_snapshot * quantity — a hint only, not revalidated against live prices
  updatedAt: string
}

/**
 * Admin-only read: active carts with at least one item, untouched for
 * `inactiveDays` or more. Data/query only — no notification is sent (no
 * configured channel exists; see phase spec).
 */
export async function listAbandonedCarts(db: SupabaseClient, inactiveDays = 3, limit = 200): Promise<AbandonedCartRow[]> {
  const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: carts, error } = await db
    .from('carts')
    .select('id, profile_id, updated_at')
    .eq('status', 'active')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  const cartRows = (carts ?? []) as { id: string; profile_id: string; updated_at: string }[]
  if (cartRows.length === 0) return []

  const { data: items, error: itemsError } = await db
    .from('cart_items')
    .select('cart_id, quantity, unit_price_snapshot')
    .in(
      'cart_id',
      cartRows.map((c) => c.id),
    )
  if (itemsError) throw itemsError

  const byCart = new Map<string, { count: number; subtotal: number }>()
  for (const item of (items ?? []) as { cart_id: string; quantity: number; unit_price_snapshot: number }[]) {
    const agg = byCart.get(item.cart_id) ?? { count: 0, subtotal: 0 }
    agg.count += item.quantity
    agg.subtotal += item.quantity * item.unit_price_snapshot
    byCart.set(item.cart_id, agg)
  }

  return cartRows
    .map((c) => ({
      cartId: c.id,
      profileId: c.profile_id,
      itemCount: byCart.get(c.id)?.count ?? 0,
      subtotalHint: byCart.get(c.id)?.subtotal ?? 0,
      updatedAt: c.updated_at,
    }))
    .filter((c) => c.itemCount > 0)
}
