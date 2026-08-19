/**
 * Self-contained "flag for accounting review" helper — Phase 11.
 *
 * IMPORTANT / concurrency note: Phase 7 (Local Accounting, a sibling agent
 * running in parallel off the same `main` commit) may not have landed yet,
 * and this phase must not depend on its output or import from
 * backend/services/accounting/. So a failed-delivery/RTO event writes
 * DIRECTLY to the `local_financial_transactions` table (schema already
 * exists from Phase 1 — supabase/migrations/0011_accounting_erp_sync.sql)
 * via this small helper, rather than through Phase 7's eventual service
 * layer. This is a deliberate, documented duplication: once both phases
 * are merged, a later integration pass should consolidate RTO/failed-
 * delivery review-flagging into Phase 7's accounting service instead of
 * this standalone insert. See docs/phase-11-completion-report.md's "Known
 * limitations" section.
 *
 * This helper deliberately NEVER guesses a financial amount (e.g. "the COD
 * amount is now owed back" or "refund X"). It records amount = 0 and puts
 * the actionable detail in `description` — a human (or Phase 7's eventual
 * reconciliation logic) decides the real financial consequence. Per spec:
 * "trigger a flag/event for operational review... rather than
 * automatically guessing financial results."
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RecordCourierAccountingReviewInput {
  orderId: string
  shipmentId: string
  /** e.g. 'failed_delivery', 'rto_initiated', 'rto_in_transit', 'rto_delivered' */
  reviewReason: string
  note?: string
}

/**
 * Minimal client shape this helper needs, so it can be unit-tested with a
 * fake and doesn't force a hard dependency on the concrete supabase-js
 * type in tests.
 */
export interface AccountingReviewWriter {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>
  }
}

export async function recordCourierAccountingReview(
  db: AccountingReviewWriter | SupabaseClient,
  input: RecordCourierAccountingReviewInput,
): Promise<void> {
  const { error } = await (db as AccountingReviewWriter).from('local_financial_transactions').insert({
    order_id: input.orderId,
    payment_id: null,
    transaction_type: 'adjustment',
    amount: 0, // deliberately never guessed — see module header
    currency: 'PKR',
    description: `[Leopards courier review needed] ${input.reviewReason} on shipment ${input.shipmentId}.${
      input.note ? ` ${input.note}` : ''
    } Requires manual accounting review — no financial amount has been assumed.`,
  })
  if (error) {
    throw new Error(`Failed to record courier accounting review for shipment "${input.shipmentId}": ${error.message}`)
  }
}
