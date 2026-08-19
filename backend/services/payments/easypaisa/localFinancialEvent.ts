/**
 * TEMPORARY, self-contained local-financial-event writer.
 *
 * Phase 7 (Local Operational Accounting) — running as a sibling agent in a
 * separate worktree at the time this phase was implemented — is expected
 * to own a real `backend/services/accounting/accounting.service.ts` with a
 * proper recording API. This phase cannot depend on that file existing at
 * merge time, so it inserts directly into the already-shipped
 * `local_financial_transactions` table (supabase/migrations/0011_accounting_erp_sync.sql,
 * Phase 1) instead.
 *
 * DO NOT let this duplication grow: once Phase 7 and Phase 10 are both
 * merged, a follow-up pass should delete this file and call Phase 7's
 * accounting service from `easypaisa.service.ts` instead, so there is only
 * one code path that writes `local_financial_transactions` rows.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RecordLocalFinancialEventInput {
  orderId: string
  paymentId: string
  transactionType: 'sale' | 'refund' | 'adjustment'
  amount: number // minor units
  currency: string
  description: string
}

export async function recordLocalFinancialEvent(db: SupabaseClient, input: RecordLocalFinancialEventInput): Promise<void> {
  const { error } = await db.from('local_financial_transactions').insert({
    order_id: input.orderId,
    payment_id: input.paymentId,
    transaction_type: input.transactionType,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    // ledgix_document_id / ledgix_document_number stay null here — ERP
    // receipt sync is Phase 8's job (see easypaisa.service.ts's TODO at the
    // point this function is called).
  })
  if (error) throw error
}
