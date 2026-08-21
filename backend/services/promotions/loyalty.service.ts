/**
 * Loyalty points ledger — DB-facing half of Phase 13's loyalty feature. The
 * pure arithmetic (earn rate, redemption value, balance summation, the
 * redeemability check) lives in backend/lib/loyalty and is reused as-is
 * here; this module only adds the Supabase reads/writes around it.
 *
 * Earn events are written by a DB trigger (0022_promotions_engine.sql,
 * fn_promotions_on_order_status_change) when an order reaches 'delivered'
 * — not by any function in this file — so that earning works no matter
 * which service transitions order_status. Reversal on cancellation/refund
 * is the same trigger. The one write this module DOES own is the
 * checkout-time REDEEM entry (called from
 * backend/services/orders/orders.service.ts::createOrder, after the order
 * row exists, so order_id is available for the idempotency key and the
 * ledger row).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertRedeemable, computeMaxRedeemablePoints, computeRedemptionValue, sumLedgerBalance } from '../../lib/loyalty/index.ts'
import { NotFoundError } from '../../lib/errors/index.ts'

export interface LoyaltyLedgerEntry {
  id: string
  orderId: string | null
  entryType: 'earn' | 'redeem' | 'reversal'
  points: number
  description: string | null
  createdAt: string
}

interface LedgerRow {
  id: string
  order_id: string | null
  entry_type: 'earn' | 'redeem' | 'reversal'
  points: number
  description: string | null
  created_at: string
}

function mapEntry(row: LedgerRow): LoyaltyLedgerEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    entryType: row.entry_type,
    points: row.points,
    description: row.description,
    createdAt: row.created_at,
  }
}

export async function getCustomerIdForProfile(db: SupabaseClient, profileId: string): Promise<string | null> {
  const { data, error } = await db.from('customers').select('id').eq('profile_id', profileId).maybeSingle()
  if (error) throw error
  return (data?.id as string | undefined) ?? null
}

export async function listLedgerForCustomer(db: SupabaseClient, customerId: string, limit = 100): Promise<LoyaltyLedgerEntry[]> {
  const { data, error } = await db
    .from('loyalty_ledger_entries')
    .select('id, order_id, entry_type, points, description, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => mapEntry(row as LedgerRow))
}

export async function getLoyaltyBalance(db: SupabaseClient, customerId: string): Promise<number> {
  // Balance is always a live sum — see backend/lib/loyalty's module header.
  // A customer's history is small enough in this phase's scope to sum in
  // application code rather than needing a materialized/aggregate column.
  const { data, error } = await db.from('loyalty_ledger_entries').select('points').eq('customer_id', customerId)
  if (error) throw error
  return sumLedgerBalance((data ?? []) as { points: number }[])
}

export interface LoyaltySummary {
  balance: number
  maxRedeemableForSubtotal: (subtotalMinorUnits: number) => number
  history: LoyaltyLedgerEntry[]
}

export async function getLoyaltySummaryForCustomer(db: SupabaseClient, customerId: string): Promise<LoyaltySummary> {
  const [balance, history] = await Promise.all([getLoyaltyBalance(db, customerId), listLedgerForCustomer(db, customerId)])
  return { balance, maxRedeemableForSubtotal: (subtotal) => computeMaxRedeemablePoints(balance, subtotal), history }
}

/**
 * Checkout-time redemption write. Must be called AFTER the order row has
 * been inserted (see orders.service.ts::createOrder) so order_id is
 * available. Re-checks the balance immediately before writing (in addition
 * to whatever check the caller already did against an earlier balance
 * read) to shrink — though not eliminate — the race window from two
 * concurrent checkouts both trying to spend the same points; a full
 * distributed-lock solution is out of scope for this phase (see the
 * completion report's known limitations, matching the same
 * don't-over-engineer guidance the coupon-claim path documents).
 */
export async function redeemLoyaltyPoints(
  db: SupabaseClient,
  input: { customerId: string; orderId: string; orderNumber: string; points: number; subtotalMinorUnits: number },
): Promise<{ discountValue: number }> {
  const balance = await getLoyaltyBalance(db, input.customerId)
  assertRedeemable(input.points, balance, input.subtotalMinorUnits)

  const { error } = await db.from('loyalty_ledger_entries').insert({
    customer_id: input.customerId,
    order_id: input.orderId,
    entry_type: 'redeem',
    points: -input.points,
    description: `Points redeemed for order ${input.orderNumber}`,
    idempotency_key: `loyalty:redeem:${input.orderId}`,
  })
  if (error) {
    // Same event already recorded (idempotency_key unique violation) — a
    // retried createOrder() call after a partial failure. Treat as success.
    if ((error as { code?: string }).code !== '23505') throw error
  }

  return { discountValue: computeRedemptionValue(input.points) }
}

/** Admin/customer read of one customer's loyalty summary by customer id (existence-checked). */
export async function requireCustomer(db: SupabaseClient, customerId: string): Promise<void> {
  const { data, error } = await db.from('customers').select('id').eq('id', customerId).maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Customer')
}
