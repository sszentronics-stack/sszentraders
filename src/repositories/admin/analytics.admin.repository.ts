/**
 * Admin commerce analytics — Phase 15 (ERP Reporting & Commerce Analytics).
 *
 * Direct RLS-scoped reads (same pattern as orders.admin.repository.ts and
 * customers.admin.repository.ts — `orders_admin_all`, `order_items_admin_all`,
 * `returns_admin_all`, `carts_admin_all`, `products_admin_all`,
 * `product_categories_admin_all`, `inventory_cache_admin_all`, all from
 * 0014_row_level_security.sql / 0017_cart_wishlist_recently_viewed.sql). No
 * new Edge Function or DB migration was needed — everything here is a
 * read-only aggregation over existing tables.
 *
 * LABELING RULE (do not violate): everything this file returns is
 * "commerce analytics" — operational numbers computed from Aura's own
 * order/cart/return data. None of it is ERP-authoritative accounting, and
 * it must never be presented as "ERP actuals" anywhere in the UI. The
 * separate ERP financial-reports section (see erpFinancialReportsStatus
 * below and the Reports page) reuses Phase 8's getErpHealthStatus via the
 * existing accounting.admin.repository and explicitly renders an
 * "unavailable" state — it never fabricates a number.
 *
 * The exact definition of every metric is documented inline next to its
 * pure-arithmetic implementation in backend/lib/analytics/index.ts, and
 * restated in docs/phase-15-completion-report.md.
 */
import { getSupabaseBrowserClient } from '../../lib/supabase/client'
import { listAbandonedCarts as fetchAbandonedCarts } from '../promotions.repository'
import {
  computeAbandonedCartRate,
  computeAverageClvProxy,
  computeAverageOrderValue,
  computeOrderConversionProxy,
  computeReturnRate,
  computeReturningCustomerRate,
} from '../../../backend/lib/analytics/index'

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

export type DateRangePreset = '7d' | '30d' | '90d'

export interface DateRange {
  preset: DateRangePreset | 'custom'
  from: string // ISO, inclusive, UTC
  to: string // ISO, inclusive, UTC
}

const PRESET_DAYS: Record<DateRangePreset, number> = { '7d': 7, '30d': 30, '90d': 90 }

/** All report timestamps are stored/queried in UTC (see orders.placed_at etc.) and simply rendered with the browser's local timezone for display — no separate timezone-conversion layer exists or is needed. */
export function getDateRangeForPreset(preset: DateRangePreset, now: Date = new Date()): DateRange {
  const to = now
  const from = new Date(to.getTime() - PRESET_DAYS[preset] * 24 * 60 * 60 * 1000)
  return { preset, from: from.toISOString(), to: to.toISOString() }
}

export function customDateRange(fromDate: string, toDate: string): DateRange {
  // toDate is a plain <input type="date"> value (YYYY-MM-DD) — extend to end-of-day so the range is inclusive of that whole day.
  const from = new Date(`${fromDate}T00:00:00.000Z`).toISOString()
  const to = new Date(`${toDate}T23:59:59.999Z`).toISOString()
  return { preset: 'custom', from, to }
}

interface OrderRow {
  id: string
  customer_id: string | null
  grand_total: number
  order_status: string
  placed_at: string
}

async function fetchOrdersInRange(range: DateRange, limit = 2000): Promise<OrderRow[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('orders')
    .select('id, customer_id, grand_total, order_status, placed_at')
    .gte('placed_at', range.from)
    .lte('placed_at', range.to)
    .neq('order_status', 'cancelled')
    .order('placed_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Failed to load orders for analytics: ${error.message}`)
  return (data ?? []) as OrderRow[]
}

// ---------------------------------------------------------------------------
// Commerce overview
// ---------------------------------------------------------------------------

export interface CommerceOverview {
  range: DateRange
  orderCount: number
  revenue: number // minor units — sum(grand_total) of non-cancelled orders in range
  averageOrderValue: number | null // minor units
  returnCount: number
  returnRate: number | null
  cartCount: number
  orderConversionProxy: number | null
  returningCustomerCount: number
  distinctOrderingCustomerCount: number
  returningCustomerRate: number | null
  abandonedCartCount: number // live snapshot, NOT scoped to `range` — see backend/lib/analytics
  abandonedCartRate: number | null
  /** Truncation flag — true if the order fetch hit its row cap, so counts/sums may under-represent very large ranges. */
  truncated: boolean
}

async function countReturnsInRange(range: DateRange): Promise<number> {
  const client = getSupabaseBrowserClient()
  const { count, error } = await client
    .from('returns')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', range.from)
    .lte('created_at', range.to)
  if (error) throw new Error(`Failed to count returns for analytics: ${error.message}`)
  return count ?? 0
}

async function countCartsInRange(range: DateRange): Promise<number> {
  const client = getSupabaseBrowserClient()
  const { count, error } = await client
    .from('carts')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', range.from)
    .lte('created_at', range.to)
  if (error) throw new Error(`Failed to count carts for analytics: ${error.message}`)
  return count ?? 0
}

/**
 * Returning-customer rate needs each in-range customer's ALL-TIME
 * non-cancelled order count, not just their orders inside `range` — so this
 * issues a second, targeted query for exactly the customers who ordered in
 * range (never a full customer/order table scan).
 */
async function countReturningCustomers(inRangeCustomerIds: string[]): Promise<number> {
  if (inRangeCustomerIds.length === 0) return 0
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('orders')
    .select('customer_id, order_status')
    .in('customer_id', inRangeCustomerIds)
    .neq('order_status', 'cancelled')
  if (error) throw new Error(`Failed to load lifetime order history for analytics: ${error.message}`)

  const countByCustomer = new Map<string, number>()
  for (const row of (data ?? []) as { customer_id: string | null; order_status: string }[]) {
    if (!row.customer_id) continue
    countByCustomer.set(row.customer_id, (countByCustomer.get(row.customer_id) ?? 0) + 1)
  }
  let returning = 0
  for (const count of countByCustomer.values()) if (count > 1) returning++
  return returning
}

export async function getCommerceOverview(range: DateRange): Promise<CommerceOverview> {
  const ORDER_FETCH_LIMIT = 2000
  const [orders, returnCount, cartCount, abandonedCarts] = await Promise.all([
    fetchOrdersInRange(range, ORDER_FETCH_LIMIT),
    countReturnsInRange(range),
    countCartsInRange(range),
    fetchAbandonedCarts(3),
  ])

  const orderCount = orders.length
  const revenue = orders.reduce((sum, o) => sum + o.grand_total, 0)
  const averageOrderValue = computeAverageOrderValue(orders.map((o) => ({ grandTotal: o.grand_total })))
  const distinctCustomerIds = [...new Set(orders.map((o) => o.customer_id).filter((id): id is string => Boolean(id)))]
  const returningCustomerCount = await countReturningCustomers(distinctCustomerIds)

  return {
    range,
    orderCount,
    revenue,
    averageOrderValue,
    returnCount,
    returnRate: computeReturnRate(returnCount, orderCount),
    cartCount,
    orderConversionProxy: computeOrderConversionProxy(orderCount, cartCount),
    returningCustomerCount,
    distinctOrderingCustomerCount: distinctCustomerIds.length,
    returningCustomerRate: computeReturningCustomerRate(returningCustomerCount, distinctCustomerIds.length),
    abandonedCartCount: abandonedCarts.length,
    abandonedCartRate: computeAbandonedCartRate(abandonedCarts.length, orderCount),
    truncated: orderCount >= ORDER_FETCH_LIMIT,
  }
}

// ---------------------------------------------------------------------------
// Product / category / brand performance (real order-item aggregation)
// ---------------------------------------------------------------------------

export interface ProductPerformanceRow {
  productId: string | null
  name: string
  sku: string
  quantitySold: number
  revenue: number // minor units
  /** Best-effort stock context (Phase 9's inventory_cache) — null when the product has no mapped/synced variants. */
  quantityAvailable: number | null
}

interface OrderItemRow {
  order_id: string
  product_id: string | null
  sku: string
  product_name: string
  quantity: number
  line_total: number
}

async function fetchOrderItemsForOrders(orderIds: string[], limit = 5000): Promise<OrderItemRow[]> {
  if (orderIds.length === 0) return []
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('order_items')
    .select('order_id, product_id, sku, product_name, quantity, line_total')
    .in('order_id', orderIds)
    .limit(limit)
  if (error) throw new Error(`Failed to load order items for analytics: ${error.message}`)
  return (data ?? []) as OrderItemRow[]
}

async function fetchStockByProductId(productIds: string[]): Promise<Map<string, number>> {
  const stockByProduct = new Map<string, number>()
  if (productIds.length === 0) return stockByProduct
  const client = getSupabaseBrowserClient()
  const { data: variants, error: variantsError } = await client.from('product_variants').select('id, product_id').in('product_id', productIds)
  if (variantsError) throw new Error(`Failed to load variants for stock context: ${variantsError.message}`)
  const variantRows = (variants ?? []) as { id: string; product_id: string }[]
  if (variantRows.length === 0) return stockByProduct
  const productByVariant = new Map(variantRows.map((v) => [v.id, v.product_id]))

  const { data: cache, error: cacheError } = await client
    .from('inventory_cache')
    .select('variant_id, quantity_available')
    .in(
      'variant_id',
      variantRows.map((v) => v.id),
    )
  if (cacheError) throw new Error(`Failed to load inventory cache for stock context: ${cacheError.message}`)
  for (const row of (cache ?? []) as { variant_id: string; quantity_available: number }[]) {
    const productId = productByVariant.get(row.variant_id)
    if (!productId) continue
    stockByProduct.set(productId, (stockByProduct.get(productId) ?? 0) + row.quantity_available)
  }
  return stockByProduct
}

/**
 * Best sellers (real order-item aggregation, non-cancelled orders in
 * range) and slow movers (published products with the LOWEST quantity sold
 * in range, including zero) — plus Phase 9 stock context where a product's
 * variants are ERP-mapped and synced.
 */
export async function getProductPerformance(range: DateRange, limit = 10): Promise<{ bestSellers: ProductPerformanceRow[]; slowMovers: ProductPerformanceRow[] }> {
  const orders = await fetchOrdersInRange(range)
  const items = await fetchOrderItemsForOrders(orders.map((o) => o.id))

  const soldByKey = new Map<string, { productId: string | null; name: string; sku: string; quantitySold: number; revenue: number }>()
  for (const item of items) {
    const key = item.product_id ?? `sku:${item.sku}`
    const agg = soldByKey.get(key) ?? { productId: item.product_id, name: item.product_name, sku: item.sku, quantitySold: 0, revenue: 0 }
    agg.quantitySold += item.quantity
    agg.revenue += item.line_total
    soldByKey.set(key, agg)
  }

  const soldProductIds = [...soldByKey.values()].map((v) => v.productId).filter((id): id is string => Boolean(id))
  const stockByProduct = await fetchStockByProductId(soldProductIds)

  const sold = [...soldByKey.values()]
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .map((row) => ({ ...row, quantityAvailable: row.productId ? stockByProduct.get(row.productId) ?? null : null }))

  const bestSellers = sold.slice(0, limit)

  // Slow movers: published products with the lowest quantity sold in range, including products with zero sales.
  const client = getSupabaseBrowserClient()
  const { data: publishedProducts, error: productsError } = await client.from('products').select('id, name').eq('status', 'published').limit(500)
  if (productsError) throw new Error(`Failed to load products for slow-mover analysis: ${productsError.message}`)
  const soldQuantityByProductId = new Map<string, number>()
  for (const row of soldByKey.values()) if (row.productId) soldQuantityByProductId.set(row.productId, row.quantitySold)

  const stockForAll = await fetchStockByProductId(((publishedProducts ?? []) as { id: string; name: string }[]).map((p) => p.id))
  const slowMovers = ((publishedProducts ?? []) as { id: string; name: string }[])
    .map((p) => ({
      productId: p.id,
      name: p.name,
      sku: '',
      quantitySold: soldQuantityByProductId.get(p.id) ?? 0,
      revenue: soldByKey.get(p.id)?.revenue ?? 0,
      quantityAvailable: stockForAll.get(p.id) ?? null,
    }))
    .sort((a, b) => a.quantitySold - b.quantitySold)
    .slice(0, limit)

  return { bestSellers, slowMovers }
}

export interface GroupedPerformanceRow {
  id: string
  name: string
  quantitySold: number
  revenue: number
}

/** Revenue/quantity by brand, from the same in-range non-cancelled order items used for product performance. */
export async function getBrandPerformance(range: DateRange, limit = 10): Promise<GroupedPerformanceRow[]> {
  const orders = await fetchOrdersInRange(range)
  const items = await fetchOrderItemsForOrders(orders.map((o) => o.id))
  const productIds = [...new Set(items.map((i) => i.product_id).filter((id): id is string => Boolean(id)))]
  if (productIds.length === 0) return []

  const client = getSupabaseBrowserClient()
  const { data: products, error } = await client.from('products').select('id, brand_id, brands ( id, name )').in('id', productIds)
  if (error) throw new Error(`Failed to load brands for analytics: ${error.message}`)

  const brandByProduct = new Map<string, { id: string; name: string } | null>()
  for (const row of (products ?? []) as { id: string; brand_id: string | null; brands: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
    const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands
    brandByProduct.set(row.id, brand ?? null)
  }

  const byBrand = new Map<string, GroupedPerformanceRow>()
  for (const item of items) {
    if (!item.product_id) continue
    const brand = brandByProduct.get(item.product_id)
    const key = brand?.id ?? 'unassigned'
    const name = brand?.name ?? 'No brand assigned'
    const agg = byBrand.get(key) ?? { id: key, name, quantitySold: 0, revenue: 0 }
    agg.quantitySold += item.quantity
    agg.revenue += item.line_total
    byBrand.set(key, agg)
  }
  return [...byBrand.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

/** Revenue/quantity by category, from the same in-range non-cancelled order items. A product in multiple categories contributes to each. */
export async function getCategoryPerformance(range: DateRange, limit = 10): Promise<GroupedPerformanceRow[]> {
  const orders = await fetchOrdersInRange(range)
  const items = await fetchOrderItemsForOrders(orders.map((o) => o.id))
  const productIds = [...new Set(items.map((i) => i.product_id).filter((id): id is string => Boolean(id)))]
  if (productIds.length === 0) return []

  const client = getSupabaseBrowserClient()
  const { data: links, error } = await client.from('product_categories').select('product_id, categories ( id, name )').in('product_id', productIds)
  if (error) throw new Error(`Failed to load categories for analytics: ${error.message}`)

  const categoriesByProduct = new Map<string, { id: string; name: string }[]>()
  for (const row of (links ?? []) as { product_id: string; categories: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
    const cats = Array.isArray(row.categories) ? row.categories : row.categories ? [row.categories] : []
    categoriesByProduct.set(row.product_id, cats)
  }

  const byCategory = new Map<string, GroupedPerformanceRow>()
  for (const item of items) {
    if (!item.product_id) continue
    const categories = categoriesByProduct.get(item.product_id) ?? []
    const targets = categories.length > 0 ? categories : [{ id: 'uncategorized', name: 'Uncategorized' }]
    for (const category of targets) {
      const agg = byCategory.get(category.id) ?? { id: category.id, name: category.name, quantitySold: 0, revenue: 0 }
      agg.quantitySold += item.quantity
      agg.revenue += item.line_total
      byCategory.set(category.id, agg)
    }
  }
  return [...byCategory.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

// ---------------------------------------------------------------------------
// Customer cohort / CLV foundation
// ---------------------------------------------------------------------------

export interface CustomerCohortSummary {
  newCustomersInRange: number // customers.created_at within range
  averageClvProxy: number | null // minor units — see computeAverageClvProxy for the exact (proxy) definition
  customersSampled: number // how many customers the CLV-proxy average was computed over (capped sample, see below)
}

/**
 * Foundation-level cohort read: new-customer count in range (real, exact)
 * plus an average CLV proxy computed over a capped sample of customers who
 * ordered in range (not the full customer base — this is a v1 foundation,
 * not a full retention/cohort engine). Full per-customer segmentation
 * (VIP/inactive/etc.) already lives in Phase 13's segmentation.service and
 * the Customers admin module — this does not duplicate that, it links to
 * it.
 */
export async function getCustomerCohortSummary(range: DateRange): Promise<CustomerCohortSummary> {
  const client = getSupabaseBrowserClient()
  const { count: newCustomersInRange, error: newCustomersError } = await client
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', range.from)
    .lte('created_at', range.to)
  if (newCustomersError) throw new Error(`Failed to count new customers: ${newCustomersError.message}`)

  const orders = await fetchOrdersInRange(range)
  const distinctCustomerIds = [...new Set(orders.map((o) => o.customer_id).filter((id): id is string => Boolean(id)))].slice(0, 200)

  let averageClvProxy: number | null = null
  if (distinctCustomerIds.length > 0) {
    const { data: lifetimeOrders, error: lifetimeError } = await client
      .from('orders')
      .select('customer_id, grand_total, order_status')
      .in('customer_id', distinctCustomerIds)
      .neq('order_status', 'cancelled')
    if (lifetimeError) throw new Error(`Failed to load lifetime orders for CLV proxy: ${lifetimeError.message}`)
    const totalsByCustomer = new Map<string, number>()
    for (const row of (lifetimeOrders ?? []) as { customer_id: string | null; grand_total: number }[]) {
      if (!row.customer_id) continue
      totalsByCustomer.set(row.customer_id, (totalsByCustomer.get(row.customer_id) ?? 0) + row.grand_total)
    }
    averageClvProxy = computeAverageClvProxy([...totalsByCustomer.values()])
  }

  return {
    newCustomersInRange: newCustomersInRange ?? 0,
    averageClvProxy,
    customersSampled: distinctCustomerIds.length,
  }
}
