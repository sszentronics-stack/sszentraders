/**
 * Pure local-accounting domain rules — event-type vocabulary, deterministic
 * idempotency-key construction, and the ERP-sync-state helpers. Nothing
 * here touches a database (that's
 * backend/services/accounting/accounting.service.ts); unit-testable
 * without a live Supabase project, same pattern as backend/lib/orders.
 *
 * IMPORTANT — this module and everything downstream of it produce
 * OPERATIONAL STAGING records, not authoritative financial reporting.
 * LedGix ERP (Phase 8) is the authoritative accounting system; every
 * function here writes a local "Aura believes this happened" copy, which
 * Phase 8's sync will later reconcile against LedGix and stamp with a real
 * ERP document reference (ledgix_document_id/ledgix_document_number on
 * local_financial_transactions). Do not read local_financial_transactions
 * as if it were a general ledger — it deliberately has no chart of
 * accounts, no debit/credit double-entry, no invoice numbering. It is a
 * durable "this needs to reach the ERP" queue with enough detail for
 * Phase 8 to build the correct ERP document from.
 */

/**
 * The full local financial event vocabulary this phase supports, matching
 * the `chk_local_financial_transactions_type` check constraint added by
 * 0019_accounting_local_financial_events.sql. Keep these two in sync.
 */
export const FINANCIAL_TRANSACTION_TYPES = [
  'sale',
  'payment',
  'cod_collection',
  'discount',
  'delivery_charge',
  'cancellation',
  'return',
  'refund',
] as const

export type FinancialTransactionType = (typeof FINANCIAL_TRANSACTION_TYPES)[number]

export function isFinancialTransactionType(value: string): value is FinancialTransactionType {
  return (FINANCIAL_TRANSACTION_TYPES as readonly string[]).includes(value)
}

/**
 * Debit/credit semantics, documented only for Phase 8's future ERP mapping
 * — Aura does not maintain a chart of accounts locally, so this is purely
 * informational metadata carried alongside each event type, not something
 * enforced or computed against a ledger here.
 */
export const FINANCIAL_TRANSACTION_SEMANTICS: Record<FinancialTransactionType, string> = {
  sale: 'Revenue recognized (credit revenue / debit accounts receivable) once LedGix issues the invoice.',
  payment: 'Cash/bank received against a receivable (debit cash or bank / credit accounts receivable).',
  cod_collection: 'Cash collected by the courier on delivery, pending remittance (debit COD-in-transit / credit accounts receivable).',
  discount: 'Reduces recognized revenue on the related sale (debit revenue / credit accounts receivable) — informational only; discounts are already netted into order totals by backend/lib/money.',
  delivery_charge: 'Shipping revenue or pass-through cost, depending on Aura\'s chosen ERP mapping (deferred to Phase 8).',
  cancellation: 'Reverses an unfulfilled sale before payment settles (credit accounts receivable / debit revenue) — memo-only if no payment was ever collected.',
  return: 'Inventory/revenue reversal for goods returned by the customer (credit accounts receivable / debit revenue), ahead of any refund.',
  refund: 'Cash/bank paid back to the customer (credit cash or bank / debit accounts receivable).',
}

/**
 * Deterministic idempotency keys — one per logical domain event, not per
 * HTTP request. Recording the same domain event twice (e.g. a retried
 * order-creation call, or a webhook redelivery once payments exist) always
 * produces the same key, so the unique index in 0019 rejects the second
 * insert at the database level (see accounting.service.ts's conflict
 * handling) rather than relying on an application-level check-then-insert,
 * which has a race window under concurrent calls.
 *
 * Keys are scoped by event type so the same order can have independent
 * sale/cancellation/return events without colliding with each other.
 */
export function buildFinancialEventIdempotencyKey(
  type: FinancialTransactionType,
  entityId: string,
  suffix?: string,
): string {
  const base = `accounting:${type}:${entityId}`
  return suffix ? `${base}:${suffix}` : base
}

/**
 * ERP sync-job state vocabulary this phase writes into erp_sync_jobs
 * (0011_accounting_erp_sync.sql's `erp_sync_status` enum:
 * pending | in_progress | succeeded | failed | skipped). Phase 7 never
 * moves a job past 'pending' — Phase 8's actual ERP client does that. The
 * spec's "retrying" state is represented here as: status reset back to
 * 'pending' with attempts > 0 (see accounting.service.ts's
 * retryFinancialEventSync) rather than a distinct enum value, so no schema
 * change was needed to express it.
 */
export const ERP_ENTITY_TYPE_FINANCIAL_EVENT = 'local_financial_transaction'

export interface FinancialEventSyncState {
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'skipped'
  attempts: number
}

/** True when a sync job needs operator attention (never succeeded, or actively failed). */
export function isUnsyncedFinancialEventState(state: FinancialEventSyncState): boolean {
  return state.status === 'pending' || state.status === 'failed' || state.status === 'in_progress'
}
