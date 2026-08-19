/**
 * Pure LedGix ERP sync domain logic — Phase 8 (LedGix ERP Integration).
 * Nothing here touches a database or the network; DB orchestration lives in
 * backend/services/erp/ledgix/, the same split Phase 7
 * (backend/lib/accounting vs backend/services/accounting) already
 * established. Unit-testable without a live Supabase project or live
 * LedGix credentials.
 *
 * LedGix ERP is the eventual authoritative accounting/reporting system;
 * Aura's local tables are operational copies that this module helps decide
 * how/whether to push to (or reconcile against) LedGix — see
 * backend/lib/accounting's module doc for the shared "operational staging,
 * not a second ledger" framing this phase continues.
 */
import type { FinancialTransactionType } from '../accounting'

/**
 * What kind of ERP document a given local financial event maps to, once a
 * real sync is attempted. `discount`/`delivery_charge` are deliberately
 * `skip`: both are already netted into the `sale` event's invoice line
 * items (see backend/lib/accounting's FINANCIAL_TRANSACTION_SEMANTICS), so
 * syncing them as their own ERP document would double-count the same money
 * — Phase 8's sync worker marks their sync job `skipped` rather than
 * attempting (and forever failing not-configured on) a document LedGix
 * doesn't need as a separate entity. `adjustment` is also `skip`: it's a
 * local-only "flag for manual review" record (see
 * backend/services/accounting/accounting.service.ts's
 * recordAdjustmentTransaction), never something ERP has a document type
 * for.
 */
export type ErpDocumentAction = 'invoice' | 'receipt' | 'credit_note' | 'skip'

const ERP_DOCUMENT_ACTION_BY_TRANSACTION_TYPE: Record<FinancialTransactionType, ErpDocumentAction> = {
  sale: 'invoice',
  payment: 'receipt',
  cod_collection: 'receipt',
  discount: 'skip',
  delivery_charge: 'skip',
  cancellation: 'credit_note',
  return: 'credit_note',
  refund: 'credit_note',
  adjustment: 'skip',
}

export function mapFinancialEventToErpAction(transactionType: FinancialTransactionType): ErpDocumentAction {
  return ERP_DOCUMENT_ACTION_BY_TRANSACTION_TYPE[transactionType]
}

/**
 * Error-classification for the sync worker's retry logic. This is
 * necessarily a best-guess taxonomy today — the only error this codebase
 * can actually produce right now is `IntegrationNotConfiguredError` (every
 * LedGixErpProvider method throws it unconditionally), which always
 * classifies as `not_configured`. The `transient`/`permanent` split exists
 * so the sync worker's retry decision (backend/services/erp/ledgix/sync.service.ts)
 * has a real seam to plug a genuine HTTP-status-aware classifier into once
 * real LedGix error responses exist, without changing any caller.
 */
export type ErpSyncErrorClass = 'not_configured' | 'transient' | 'permanent'

export function classifyErpSyncError(err: unknown): ErpSyncErrorClass {
  if (err instanceof Error && err.name === 'IntegrationNotConfiguredError') return 'not_configured'
  if (err instanceof TypeError) return 'transient' // e.g. a fetch-layer network failure, once real HTTP calls exist
  return 'permanent'
}

/** Whether a sync-error class should be safely retried automatically (vs. needing manual reconciliation). */
export function isRetryableErpSyncError(errorClass: ErpSyncErrorClass): boolean {
  return errorClass === 'not_configured' || errorClass === 'transient'
}

/**
 * Customer resolve-or-create decision — pure, so "given an existing
 * mapping, don't call create again" is testable without any I/O. The
 * caller (backend/services/erp/ledgix/customer.service.ts) is the one that
 * actually reads customers.ledgix_customer_id and calls
 * ErpProvider.upsertCustomer(); this function only decides which branch to
 * take given what was found.
 */
export type CustomerSyncDecision = { action: 'use_existing'; ledgixCustomerId: string } | { action: 'create' }

export function decideCustomerSync(existingLedgixCustomerId: string | null | undefined): CustomerSyncDecision {
  if (existingLedgixCustomerId) return { action: 'use_existing', ledgixCustomerId: existingLedgixCustomerId }
  return { action: 'create' }
}

// ---------------------------------------------------------------------------
// Reconciliation — genuinely useful even without live ERP data: detects
// local-succeeded/ERP-missing records, duplicate ERP references, and amount
// mismatches. Fed with constructed fixtures in tests; once Phase 8 gets a
// real "list ERP documents" capability, backend/services/erp/ledgix/
// reconciliation.service.ts feeds this the live ERP-side data instead of an
// empty/fixture array.
// ---------------------------------------------------------------------------

export interface LocalReconciliationRecord {
  id: string
  transactionType: FinancialTransactionType
  amount: number
  ledgixDocumentId: string | null
  syncStatus: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'skipped'
}

export interface ErpReconciliationRecord {
  ledgixDocumentId: string
  amount: number
}

export type ReconciliationIssueType = 'local_succeeded_erp_missing' | 'duplicate_erp_reference' | 'amount_mismatch'

export interface ReconciliationIssue {
  type: ReconciliationIssueType
  localTransactionId?: string
  ledgixDocumentId?: string
  detail: string
}

/**
 * Compares Aura's local financial-event records against a snapshot of
 * LedGix documents and returns every discrepancy found. Never mutates
 * anything and never guesses a fix — this is a detection function only;
 * acting on an issue (retry, manual override) is a separate, audited step.
 */
export function reconcileLocalWithErp(
  local: LocalReconciliationRecord[],
  erp: ErpReconciliationRecord[],
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = []
  const erpByRef = new Map<string, ErpReconciliationRecord>()
  for (const record of erp) erpByRef.set(record.ledgixDocumentId, record)

  const localByRef = new Map<string, LocalReconciliationRecord[]>()
  for (const record of local) {
    if (!record.ledgixDocumentId) continue
    const group = localByRef.get(record.ledgixDocumentId) ?? []
    group.push(record)
    localByRef.set(record.ledgixDocumentId, group)
  }

  // Duplicate reference: more than one local record claiming the same ERP
  // document. The DB unique index on ledgix_document_id should prevent this
  // in practice, but reconciliation checks for it independently rather than
  // trusting the schema constraint alone.
  for (const [ledgixDocumentId, group] of localByRef) {
    if (group.length > 1) {
      issues.push({
        type: 'duplicate_erp_reference',
        ledgixDocumentId,
        detail: `${group.length} local financial transactions reference the same LedGix document ${ledgixDocumentId}: ${group
          .map((r) => r.id)
          .join(', ')}.`,
      })
    }
  }

  for (const record of local) {
    if (record.syncStatus === 'succeeded') {
      if (!record.ledgixDocumentId) {
        issues.push({
          type: 'local_succeeded_erp_missing',
          localTransactionId: record.id,
          detail: `Financial transaction ${record.id} has sync status "succeeded" but no ledgix_document_id was stamped — this should never happen and indicates a bug in the sync worker.`,
        })
        continue
      }
      const erpRecord = erpByRef.get(record.ledgixDocumentId)
      if (!erpRecord) {
        issues.push({
          type: 'local_succeeded_erp_missing',
          localTransactionId: record.id,
          ledgixDocumentId: record.ledgixDocumentId,
          detail: `Financial transaction ${record.id} is marked synced to LedGix document ${record.ledgixDocumentId}, but that document was not found in the ERP snapshot.`,
        })
        continue
      }
      if (erpRecord.amount !== record.amount) {
        issues.push({
          type: 'amount_mismatch',
          localTransactionId: record.id,
          ledgixDocumentId: record.ledgixDocumentId,
          detail: `Financial transaction ${record.id} has amount ${record.amount}, but LedGix document ${record.ledgixDocumentId} reports ${erpRecord.amount}.`,
        })
      }
    }
  }

  return issues
}
