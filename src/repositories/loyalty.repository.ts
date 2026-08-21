/**
 * Thin wrapper around the `promotions` Edge Function's loyalty routes
 * (backend/services/promotions/loyalty.service.ts). Balance and history are
 * always server-computed from the append-only ledger — never assembled or
 * cached client-side as a mutable number.
 */
import { callEdgeFunction } from '../lib/supabase/functions'

export interface LoyaltyLedgerEntry {
  id: string
  orderId: string | null
  entryType: 'earn' | 'redeem' | 'reversal'
  points: number
  description: string | null
  createdAt: string
}

export interface LoyaltySummary {
  balance: number
  history: LoyaltyLedgerEntry[]
}

export function getMyLoyaltySummary(): Promise<LoyaltySummary> {
  return callEdgeFunction<LoyaltySummary>('promotions/loyalty', { method: 'GET' })
}
