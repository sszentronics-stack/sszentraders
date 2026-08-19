/**
 * Admin payments — "needing attention" list via direct RLS-scoped read
 * (`payments_admin_all`), reconciliation detail + refund via the `payments`
 * Edge Function's admin-gated Easypaisa routes (Phase 10).
 */
import { getSupabaseBrowserClient } from '../../lib/supabase/client'
import { callEdgeFunction } from '../../lib/supabase/functions'

export interface AdminPaymentListItem {
  id: string
  orderId: string
  orderNumber: string | null
  provider: string
  amount: number
  currency: string
  status: string
  createdAt: string
}

const NEEDS_ATTENTION_STATUSES = ['pending', 'processing', 'failed']

export async function listPaymentsNeedingAttention(limit = 25): Promise<AdminPaymentListItem[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('payments')
    .select('id, order_id, provider, amount, currency, status, created_at, orders ( order_number )')
    .in('status', NEEDS_ATTENTION_STATUSES)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Failed to list payments: ${error.message}`)
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.orders?.order_number ?? null,
    provider: row.provider,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  }))
}

export async function countPaymentsNeedingAttention(): Promise<number> {
  const client = getSupabaseBrowserClient()
  const { count, error } = await client.from('payments').select('id', { count: 'exact', head: true }).in('status', NEEDS_ATTENTION_STATUSES)
  if (error) throw new Error(`Failed to count payments: ${error.message}`)
  return count ?? 0
}

export function getPaymentReconciliationDetail(paymentId: string) {
  return callEdgeFunction<any>(`payments/easypaisa/reconciliation/${paymentId}`, { method: 'GET' })
}

export function refundEasypaisaPayment(input: { paymentId: string; amount: number; reason?: string }) {
  return callEdgeFunction<any>('payments/easypaisa/refund', { method: 'POST', body: input })
}
