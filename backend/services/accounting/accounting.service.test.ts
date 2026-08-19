/**
 * Unit tests for accounting.service.ts against a minimal in-memory fake of
 * the Supabase client surface it actually uses (from/insert/select/eq/in/
 * order/limit/single/maybeSingle/update). This is not a generic
 * supabase-js mock — it implements exactly the chains this module calls —
 * but it is enough to exercise the idempotency/conflict-handling logic
 * that matters most here: recordFinancialEvent()'s 23505-conflict fallback
 * (the same behavior Postgres's real unique index on
 * local_financial_transactions.idempotency_key produces under concurrent
 * inserts, added by 0019_accounting_local_financial_events.sql), and
 * retryFinancialEventSync()'s requeue + audit-log behavior.
 */
import { describe, expect, it } from 'vitest'
import {
  getFinancialTransactionById,
  listUnsyncedFinancialEvents,
  markErpSyncFailed,
  markErpSyncInProgress,
  markErpSyncSkipped,
  markErpSyncSucceeded,
  recordAdjustmentTransaction,
  recordCancellationTransaction,
  recordPaymentTransaction,
  recordSaleTransaction,
  retryFinancialEventSync,
  type FinancialTransactionRecord,
} from './accounting.service'

interface Row {
  [key: string]: unknown
}

function makeFakeClient() {
  const tables = new Map<string, Row[]>()
  let idCounter = 0

  function table(name: string): Row[] {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)!
  }

  function matches(row: Row, filters: Array<[string, unknown]>): boolean {
    return filters.every(([key, value]) => row[key] === value)
  }

  function from(name: string) {
    const filters: Array<[string, unknown]> = []
    let inFilter: { key: string; values: unknown[] } | null = null
    let orderBy: string | null = null
    let limitN: number | null = null

    const builder = {
      insert(row: Row) {
        const rows = table(name)
        if (name === 'local_financial_transactions' && row.idempotency_key) {
          const clash = rows.find((r) => r.idempotency_key === row.idempotency_key)
          if (clash) {
            return {
              select() {
                return {
                  async single() {
                    return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
                  },
                }
              },
              async then(resolve: (v: { error: null }) => void) {
                resolve({ error: null })
              },
            }
          }
        }
        const id = row.id ?? `id-${++idCounter}`
        const stored: Row = {
          id,
          order_id: null,
          payment_id: null,
          shipment_id: null,
          return_id: null,
          description: null,
          occurred_at: new Date().toISOString(),
          attempts: 0,
          status: 'pending',
          last_error: null,
          started_at: null,
          completed_at: null,
          scheduled_at: new Date().toISOString(),
          ledgix_document_id: null,
          ledgix_document_number: null,
          ...row,
        }
        rows.push(stored)
        return {
          select() {
            return {
              async single() {
                return { data: stored, error: null }
              },
            }
          },
          async then(resolve: (v: { error: null }) => void) {
            resolve({ error: null })
          },
        }
      },
      select(_cols?: string) {
        return builder
      },
      eq(key: string, value: unknown) {
        filters.push([key, value])
        return builder
      },
      in(key: string, values: unknown[]) {
        inFilter = { key, values }
        return builder
      },
      order(key: string) {
        orderBy = key
        return builder
      },
      limit(n: number) {
        limitN = n
        return builder
      },
      update(patch: Row) {
        return {
          eq(key: string, value: unknown) {
            const rows = table(name)
            const row = rows.find((r) => r[key] === value)
            if (row) Object.assign(row, patch)
            return Promise.resolve({ error: row ? null : { message: 'not found' } })
          },
        }
      },
      async maybeSingle() {
        let rows = table(name).filter((r) => matches(r, filters))
        if (inFilter) rows = rows.filter((r) => (inFilter as { key: string; values: unknown[] }).values.includes(r[inFilter!.key]))
        return { data: rows[0] ?? null, error: null }
      },
      async single() {
        let rows = table(name).filter((r) => matches(r, filters))
        if (inFilter) rows = rows.filter((r) => (inFilter as { key: string; values: unknown[] }).values.includes(r[inFilter!.key]))
        return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } }
      },
      // Fallback: awaiting the builder itself (no .single()/.maybeSingle()) resolves the filtered list.
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        let rows = table(name).filter((r) => matches(r, filters))
        if (inFilter) rows = rows.filter((r) => (inFilter as { key: string; values: unknown[] }).values.includes(r[inFilter!.key]))
        if (orderBy) rows = [...rows].sort((a, b) => String(a[orderBy as string]).localeCompare(String(b[orderBy as string])))
        if (limitN !== null) rows = rows.slice(0, limitN)
        resolve({ data: rows, error: null })
      },
    }
    return builder
  }

  return { from, _tables: tables }
}

type FakeClient = ReturnType<typeof makeFakeClient>
function asSupabase(db: FakeClient) {
  return db as unknown as import('@supabase/supabase-js').SupabaseClient
}
function asAuditWriter(db: FakeClient) {
  return db as unknown as import('../../lib/audit').AuditLogWriter
}

describe('recordSaleTransaction', () => {
  it('inserts a local_financial_transactions row and a pending erp_sync_jobs row', async () => {
    const db = makeFakeClient()
    const result = await recordSaleTransaction(asSupabase(db), { id: 'order-1', orderNumber: 'AURA-1', currency: 'PKR', grandTotal: 10000 })
    expect(result.transactionType).toBe('sale')
    expect(result.orderId).toBe('order-1')
    expect(result.amount).toBe(10000)

    const jobs = db._tables.get('erp_sync_jobs') ?? []
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.status).toBe('pending')
    expect(jobs[0]?.entity_id).toBe(result.id)
  })

  it('is idempotent: calling it twice for the same order returns the same transaction rather than creating a second one', async () => {
    const db = makeFakeClient()
    const first = await recordSaleTransaction(asSupabase(db), { id: 'order-2', currency: 'PKR', grandTotal: 5000 })
    const second = await recordSaleTransaction(asSupabase(db), { id: 'order-2', currency: 'PKR', grandTotal: 5000 })

    expect(second.id).toBe(first.id)
    const rows = db._tables.get('local_financial_transactions') ?? []
    expect(rows.filter((r) => r.order_id === 'order-2')).toHaveLength(1)
  })

  it('does not collide with a cancellation event on the same order (different idempotency key per event type)', async () => {
    const db = makeFakeClient()
    const sale = await recordSaleTransaction(asSupabase(db), { id: 'order-3', currency: 'PKR', grandTotal: 8000 })
    const cancellation = await recordCancellationTransaction(asSupabase(db), { id: 'order-3', currency: 'PKR', grandTotal: 8000 })

    expect(sale.id).not.toBe(cancellation.id)
    const rows = (db._tables.get('local_financial_transactions') ?? []).filter((r) => r.order_id === 'order-3')
    expect(rows).toHaveLength(2)
  })
})

describe('concurrent calls for the same event', () => {
  it('two "simultaneous" recordSaleTransaction calls for the same order never produce two rows', async () => {
    // Simulates the race the DB unique index on idempotency_key protects
    // against in production Postgres: two calls racing to insert the same
    // logical event. Here they run truly sequentially (this fake has no
    // real concurrency), but the fake's conflict branch models the same
    // "second insert sees a 23505 and replays the first" behavior the real
    // unique index guarantees regardless of interleaving.
    const db = makeFakeClient()
    const [a, b] = await Promise.all([
      recordSaleTransaction(asSupabase(db), { id: 'order-race', currency: 'PKR', grandTotal: 1000 }),
      recordSaleTransaction(asSupabase(db), { id: 'order-race', currency: 'PKR', grandTotal: 1000 }),
    ])
    expect(a.id).toBe(b.id)
    const rows = (db._tables.get('local_financial_transactions') ?? []).filter((r) => r.order_id === 'order-race')
    expect(rows).toHaveLength(1)
  })
})

describe('listUnsyncedFinancialEvents', () => {
  it('excludes events whose sync job already succeeded', async () => {
    const db = makeFakeClient()
    const synced = await recordSaleTransaction(asSupabase(db), { id: 'order-synced', currency: 'PKR', grandTotal: 100 })
    const unsynced = await recordSaleTransaction(asSupabase(db), { id: 'order-unsynced', currency: 'PKR', grandTotal: 200 })

    const jobs = db._tables.get('erp_sync_jobs') ?? []
    const syncedJob = jobs.find((j) => j.entity_id === synced.id)!
    syncedJob.status = 'succeeded'

    const events = await listUnsyncedFinancialEvents(asSupabase(db))
    const ids = events.map((e) => e.transaction.id)
    expect(ids).toContain(unsynced.id)
    expect(ids).not.toContain(synced.id)
  })
})

describe('retryFinancialEventSync', () => {
  it('requeues an existing job to pending, increments attempts, and writes an audit log', async () => {
    const db = makeFakeClient()
    const record: FinancialTransactionRecord = await recordSaleTransaction(asSupabase(db), { id: 'order-retry', currency: 'PKR', grandTotal: 300 })

    const job = (db._tables.get('erp_sync_jobs') ?? []).find((j) => j.entity_id === record.id)!
    job.status = 'failed'
    job.attempts = 2

    await retryFinancialEventSync(asSupabase(db), asAuditWriter(db), record.id, { id: 'admin-1', type: 'admin' })

    expect(job.status).toBe('pending')
    expect(job.attempts).toBe(3)

    const auditLogs = db._tables.get('audit_logs') ?? []
    expect(auditLogs).toHaveLength(1)
    expect(auditLogs[0]?.action).toBe('accounting.sync_retry_requested')
    expect(auditLogs[0]?.entity_id).toBe(record.id)
  })
})

describe('recordPaymentTransaction', () => {
  it('inserts a payment event distinct from the order sale event (Phase 10 consolidation call site)', async () => {
    const db = makeFakeClient()
    const sale = await recordSaleTransaction(asSupabase(db), { id: 'order-pay', currency: 'PKR', grandTotal: 4000 })
    const payment = await recordPaymentTransaction(asSupabase(db), { id: 'payment-1', orderId: 'order-pay', currency: 'PKR', amount: 4000 })

    expect(payment.id).not.toBe(sale.id)
    expect(payment.transactionType).toBe('payment')
    expect(payment.paymentId).toBe('payment-1')

    // Calling it again for the same payment (e.g. duplicate webhook delivery) does not duplicate the row.
    const again = await recordPaymentTransaction(asSupabase(db), { id: 'payment-1', orderId: 'order-pay', currency: 'PKR', amount: 4000 })
    expect(again.id).toBe(payment.id)
  })
})

describe('recordAdjustmentTransaction', () => {
  it('records a zero-amount review flag (Phase 11 consolidation call site)', async () => {
    const db = makeFakeClient()
    const adjustment = await recordAdjustmentTransaction(asSupabase(db), {
      orderId: 'order-rto',
      shipmentId: 'shipment-1',
      reviewReason: 'rto_initiated',
    })
    expect(adjustment.transactionType).toBe('adjustment')
    expect(adjustment.amount).toBe(0)
    expect(adjustment.shipmentId).toBe('shipment-1')
  })

  it('does not collide across distinct review reasons on the same shipment, but dedupes the same reason twice', async () => {
    const db = makeFakeClient()
    const failed = await recordAdjustmentTransaction(asSupabase(db), {
      orderId: 'order-rto2',
      shipmentId: 'shipment-2',
      reviewReason: 'failed_delivery',
    })
    const rto = await recordAdjustmentTransaction(asSupabase(db), {
      orderId: 'order-rto2',
      shipmentId: 'shipment-2',
      reviewReason: 'rto_initiated',
    })
    expect(failed.id).not.toBe(rto.id)

    const failedAgain = await recordAdjustmentTransaction(asSupabase(db), {
      orderId: 'order-rto2',
      shipmentId: 'shipment-2',
      reviewReason: 'failed_delivery',
    })
    expect(failedAgain.id).toBe(failed.id)
  })
})

describe('ERP sync-state primitives', () => {
  it('markErpSyncInProgress increments attempts and sets status', async () => {
    const db = makeFakeClient()
    const tx = await recordSaleTransaction(asSupabase(db), { id: 'order-sync-1', currency: 'PKR', grandTotal: 100 })
    await markErpSyncInProgress(asSupabase(db), tx.id)
    const job = (db._tables.get('erp_sync_jobs') ?? []).find((j) => j.entity_id === tx.id)!
    expect(job.status).toBe('in_progress')
    expect(job.attempts).toBe(1)
  })

  it('markErpSyncSucceeded stamps the ERP document reference and marks the job succeeded', async () => {
    const db = makeFakeClient()
    const tx = await recordSaleTransaction(asSupabase(db), { id: 'order-sync-2', currency: 'PKR', grandTotal: 100 })
    await markErpSyncSucceeded(asSupabase(db), tx.id, { ledgixDocumentId: 'inv-99', ledgixDocumentNumber: 'INV-0099' })

    const stored = await getFinancialTransactionById(asSupabase(db), tx.id)
    expect(stored?.ledgixDocumentId).toBe('inv-99')
    expect(stored?.ledgixDocumentNumber).toBe('INV-0099')

    const job = (db._tables.get('erp_sync_jobs') ?? []).find((j) => j.entity_id === tx.id)!
    expect(job.status).toBe('succeeded')
  })

  it('markErpSyncFailed records the sanitized error and never touches ledgix_document_id', async () => {
    const db = makeFakeClient()
    const tx = await recordSaleTransaction(asSupabase(db), { id: 'order-sync-3', currency: 'PKR', grandTotal: 100 })
    await markErpSyncFailed(asSupabase(db), tx.id, 'LedGix ERP integration is not configured.')

    const job = (db._tables.get('erp_sync_jobs') ?? []).find((j) => j.entity_id === tx.id)!
    expect(job.status).toBe('failed')
    expect(job.last_error).toBe('LedGix ERP integration is not configured.')

    const stored = await getFinancialTransactionById(asSupabase(db), tx.id)
    expect(stored?.ledgixDocumentId).toBeNull()
  })

  it('markErpSyncSkipped marks the job skipped without touching the financial transaction', async () => {
    const db = makeFakeClient()
    const tx = await recordSaleTransaction(asSupabase(db), { id: 'order-sync-4', currency: 'PKR', grandTotal: 100 })
    await markErpSyncSkipped(asSupabase(db), tx.id, 'discount is netted into the sale invoice')

    const job = (db._tables.get('erp_sync_jobs') ?? []).find((j) => j.entity_id === tx.id)!
    expect(job.status).toBe('skipped')
  })
})
