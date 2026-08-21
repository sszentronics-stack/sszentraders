import { describe, expect, it } from 'vitest'
import { buildLocalReconciliationSnapshot, runErpReconciliation } from './reconciliation.service.ts'
import { FakeSupabaseClient } from './testUtils.ts'

function asSupabase(db: FakeSupabaseClient) {
  return db as unknown as import('@supabase/supabase-js').SupabaseClient
}

function seedTransactionWithJob(
  db: FakeSupabaseClient,
  id: string,
  transactionType: string,
  amount: number,
  ledgixDocumentId: string | null,
  jobStatus: string,
) {
  const existing = db.getTable('local_financial_transactions')
  db.seed('local_financial_transactions', [
    ...existing,
    { id, transaction_type: transactionType, amount, ledgix_document_id: ledgixDocumentId, occurred_at: new Date().toISOString() },
  ])
  const existingJobs = db.getTable('erp_sync_jobs')
  db.seed('erp_sync_jobs', [...existingJobs, { id: `job-${id}`, entity_type: 'local_financial_transaction', entity_id: id, status: jobStatus }])
}

describe('buildLocalReconciliationSnapshot', () => {
  it('joins each transaction to its sync job status, defaulting to pending when no job row exists', async () => {
    const db = new FakeSupabaseClient()
    seedTransactionWithJob(db, 'tx-1', 'sale', 1000, 'inv-1', 'succeeded')
    db.seed('local_financial_transactions', [
      ...db.getTable('local_financial_transactions'),
      { id: 'tx-2', transaction_type: 'sale', amount: 500, ledgix_document_id: null, occurred_at: new Date().toISOString() },
    ])

    const snapshot = await buildLocalReconciliationSnapshot(asSupabase(db))
    expect(snapshot).toHaveLength(2)
    expect(snapshot.find((r) => r.id === 'tx-1')?.syncStatus).toBe('succeeded')
    expect(snapshot.find((r) => r.id === 'tx-2')?.syncStatus).toBe('pending')
  })
})

describe('runErpReconciliation', () => {
  it('with an empty ERP snapshot, every locally-succeeded record surfaces as local_succeeded_erp_missing (the honest state with nothing configured)', async () => {
    const db = new FakeSupabaseClient()
    seedTransactionWithJob(db, 'tx-3', 'sale', 2000, 'inv-3', 'succeeded')

    const issues = await runErpReconciliation(asSupabase(db))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ type: 'local_succeeded_erp_missing', localTransactionId: 'tx-3' })
  })

  it('reports no issues when a real ERP snapshot matches the local record', async () => {
    const db = new FakeSupabaseClient()
    seedTransactionWithJob(db, 'tx-4', 'sale', 2000, 'inv-4', 'succeeded')

    const issues = await runErpReconciliation(asSupabase(db), [{ ledgixDocumentId: 'inv-4', amount: 2000 }])
    expect(issues).toEqual([])
  })

  it('does not flag a pending (never-synced) transaction as an issue', async () => {
    const db = new FakeSupabaseClient()
    seedTransactionWithJob(db, 'tx-5', 'sale', 2000, null, 'pending')

    const issues = await runErpReconciliation(asSupabase(db))
    expect(issues).toEqual([])
  })
})
