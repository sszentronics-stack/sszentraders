/**
 * Admin order list/search — direct RLS-scoped read (`orders_admin_all`,
 * 0014_row_level_security.sql) since no admin list-all-orders Edge Function
 * route exists (only per-order GET, which already supports admin via
 * caller.isAdmin — see src/repositories/orders.repository.ts's getOrder,
 * reused as-is for the detail page). Order detail/timeline/cancel all
 * reuse the existing `orders` Edge Function repository — this file only
 * adds the list/search capability that was missing.
 */
import { getSupabaseBrowserClient } from '../../lib/supabase/client'

export interface AdminOrderListItem {
  id: string
  orderNumber: string
  email: string | null
  phone: string | null
  grandTotal: number
  currency: string
  orderStatus: string
  paymentStatus: string
  fulfillmentStatus: string
  placedAt: string
  itemCount: number
}

const LIST_SELECT = `
  id, order_number, email, phone, grand_total, currency, order_status, payment_status, fulfillment_status, placed_at,
  order_items ( id )
`

export async function listAdminOrders(params: { search?: string; status?: string; limit?: number; offset?: number } = {}): Promise<{ items: AdminOrderListItem[]; total: number }> {
  const client = getSupabaseBrowserClient()
  const limit = params.limit ?? 25
  const offset = params.offset ?? 0
  let query = client.from('orders').select(LIST_SELECT, { count: 'exact' }).order('placed_at', { ascending: false }).range(offset, offset + limit - 1)
  if (params.status) query = query.eq('order_status', params.status)
  if (params.search) {
    const term = params.search.trim()
    query = query.or(`order_number.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  if (error) throw new Error(`Failed to list orders: ${error.message}`)

  const items = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    email: row.email,
    phone: row.phone,
    grandTotal: row.grand_total,
    currency: row.currency,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    placedAt: row.placed_at,
    itemCount: (row.order_items ?? []).length,
  }))

  return { items, total: count ?? items.length }
}

/** Today's order count + revenue (grand_total sum, minor units), for the dashboard. */
export async function getTodayOrderStats(): Promise<{ count: number; revenue: number }> {
  const client = getSupabaseBrowserClient()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { data, error } = await client.from('orders').select('grand_total').gte('placed_at', startOfDay.toISOString())
  if (error) throw new Error(`Failed to load today's orders: ${error.message}`)
  const rows = (data ?? []) as { grand_total: number }[]
  return { count: rows.length, revenue: rows.reduce((sum, r) => sum + (r.grand_total ?? 0), 0) }
}

/** Orders sitting in `pending` (awaiting confirmation) — a common "needs action" queue. */
export async function countPendingOrders(): Promise<number> {
  const client = getSupabaseBrowserClient()
  const { count, error } = await client.from('orders').select('id', { count: 'exact', head: true }).eq('order_status', 'pending')
  if (error) throw new Error(`Failed to count pending orders: ${error.message}`)
  return count ?? 0
}
