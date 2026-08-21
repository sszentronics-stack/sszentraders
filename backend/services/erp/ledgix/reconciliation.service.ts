/**
 * ERP reconciliation — DB-orchestration wrapper around backend/lib/erp's
 * pure `reconcileLocalWithErp()`. Builds the local side of the comparison
 * from `local_financial_transactions` + `erp_sync_jobs` (the same source
 * `listUnsyncedFinancialEvents()` reads, but this also includes succeeded
 * rows, since reconciliation specifically cares about verifying what
 * "succeeded" locally actually exists in LedGix).
 *
 * The ERP-side snapshot (`erp` parameter) is passed in by the caller
 * because `ErpProvider` has no "list documents" capability today — LedGix
 * has no confirmed API for that, so nothing here invents one. Right now
 * every caller can only pass `[]` (or a snapshot from a future, real
 * LedGix "list documents" call once that API is known), which means today
 * this reliably surfaces every locally-`succeeded` record as
 * `local_succeeded_erp_missing` — a correct result, since nothing has ever
 * actually synced. The comparison LOGIC itself is real and fully tested
 * (backend/lib/erp/erp.test.ts) against constructed fixtures for the day a
 * real ERP snapshot exists.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { reconcileLocalWithErp, type ErpReconciliationRecord, type ReconciliationIssue } from '../../../lib/erp/index.ts'
import { ERP_ENTITY_TYPE_FINANCIAL_EVENT, type FinancialTransactionType } from '../../../lib/accounting/index.ts'

interface TransactionRow {
  id: string
  transaction_type: FinancialTransactionType
  amount: number
  ledgix_document_id: string | null
}

interface SyncJobRow {
  entity_id: string
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'skipped'
}

export async function buildLocalReconciliationSnapshot(db: SupabaseClient, limit = 500) {
  const { data: transactions, error } = await db
    .from('local_financial_transactions')
    .select('id, transaction_type, amount, ledgix_document_id')
    .order('occurred_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  const rows = (transactions ?? []) as TransactionRow[]
  if (rows.length === 0) return []

  const { data: jobs, error: jobsError } = await db
    .from('erp_sync_jobs')
    .select('entity_id, status')
    .eq('entity_type', ERP_ENTITY_TYPE_FINANCIAL_EVENT)
    .in(
      'entity_id',
      rows.map((r) => r.id),
    )
  if (jobsError) throw jobsError
  const statusByEntity = new Map<string, SyncJobRow['status']>()
  for (const job of (jobs ?? []) as SyncJobRow[]) statusByEntity.set(job.entity_id, job.status)

  return rows.map((r) => ({
    id: r.id,
    transactionType: r.transaction_type,
    amount: r.amount,
    ledgixDocumentId: r.ledgix_document_id,
    syncStatus: statusByEntity.get(r.id) ?? 'pending',
  }))
}

/**
 * Runs the full local-vs-ERP reconciliation check. `erp` defaults to an
 * empty snapshot (see this module's header for why) — pass a real snapshot
 * once a "list ERP documents" capability exists.
 */
export async function runErpReconciliation(db: SupabaseClient, erp: ErpReconciliationRecord[] = []): Promise<ReconciliationIssue[]> {
  const local = await buildLocalReconciliationSnapshot(db)
  return reconcileLocalWithErp(local, erp)
}
