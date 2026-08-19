import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { EasypaisaProvider } from '../../lib/providers/easypaisa/EasypaisaProvider'
import { LedGixErpProvider } from '../../lib/providers/ledgix/LedGixErpProvider'
import { ConflictError } from '../../lib/errors'
import type { AuditLogWriter } from '../../lib/audit'
import { FakeSupabaseClient } from './testUtils'
import { processReturnRefund } from './refund.service'

const RETURN_ID = 'return-1'
const ORDER_ID = 'order-1'
const actor = { profileId: 'admin-1', authUserId: 'auth-1' }

function client(db: FakeSupabaseClient) {
  return db as unknown as SupabaseClient & AuditLogWriter
}

function seedRefundedReturn(db: FakeSupabaseClient, paymentOverrides: Record<string, unknown> = {}) {
  db.seed('returns', [{ id: RETURN_ID, order_id: ORDER_ID, return_number: 'RET-20260819-ABC123', status: 'refunded', resolution: 'refund', refund_amount: 5000 }])
  db.seed('orders', [{ id: ORDER_ID, order_number: 'AURA-20260819-ABC123', currency: 'PKR' }])
  db.seed('payments', [{ id: 'payment-1', order_id: ORDER_ID, provider: 'cod', status: 'paid', amount: 5000, currency: 'PKR', refunded_amount: 0, created_at: '2026-08-01T00:00:00Z', ...paymentOverrides }])
}

function notConfiguredProviders() {
  return { easypaisa: new EasypaisaProvider(null), erp: new LedGixErpProvider(null) }
}

describe('processReturnRefund', () => {
  it('refuses to process a return that is not refunded/refund-resolved', async () => {
    const db = new FakeSupabaseClient()
    db.seed('returns', [{ id: RETURN_ID, order_id: ORDER_ID, return_number: 'RET-1', status: 'received', resolution: null, refund_amount: null }])
    const { easypaisa, erp } = notConfiguredProviders()
    await expect(processReturnRefund(client(db), easypaisa, erp, RETURN_ID, actor)).rejects.toBeInstanceOf(ConflictError)
  })

  it('uses the manual refund method for a COD-paid order and never calls Easypaisa', async () => {
    const db = new FakeSupabaseClient()
    seedRefundedReturn(db, { provider: 'cod' })
    const { easypaisa, erp } = notConfiguredProviders()
    const result = await processReturnRefund(client(db), easypaisa, erp, RETURN_ID, actor)
    expect(result.refundMethod).toBe('manual')
    expect(result.easypaisaAttempted).toBe(false)
    expect(result.easypaisaError).toBeNull()
  })

  it('attempts (and fails closed on) an Easypaisa refund for an Easypaisa-paid order', async () => {
    const db = new FakeSupabaseClient()
    seedRefundedReturn(db, { provider: 'easypaisa', status: 'paid', provider_transaction_id: 'txn-1' })
    const { easypaisa, erp } = notConfiguredProviders()
    const result = await processReturnRefund(client(db), easypaisa, erp, RETURN_ID, actor)
    expect(result.refundMethod).toBe('easypaisa')
    expect(result.easypaisaAttempted).toBe(true)
    expect(result.easypaisaError).toBeTruthy()
  })

  it('records exactly one local refund financial event, idempotent per (paymentId, returnId)', async () => {
    const db = new FakeSupabaseClient()
    seedRefundedReturn(db)
    const { easypaisa, erp } = notConfiguredProviders()
    await processReturnRefund(client(db), easypaisa, erp, RETURN_ID, actor)
    const refundEvents = db.getTable('local_financial_transactions').filter((row) => row.transaction_type === 'refund')
    expect(refundEvents).toHaveLength(1)
    expect(refundEvents[0]!.amount).toBe(5000)
  })

  it('never fabricates a LedGix credit note reference when the provider is not configured', async () => {
    const db = new FakeSupabaseClient()
    seedRefundedReturn(db)
    const { easypaisa, erp } = notConfiguredProviders()
    const result = await processReturnRefund(client(db), easypaisa, erp, RETURN_ID, actor)
    expect(result.erpSyncOutcome).not.toBe('succeeded')
    expect(result.ledgixCreditNoteId).toBeNull()
    expect(result.ledgixCreditNoteNumber).toBeNull()
    const returnRow = db.getTable('returns').find((r) => r.id === RETURN_ID)
    expect(returnRow?.ledgix_credit_note_id).toBeFalsy()
  })

  it('writes an audit log entry for the refund processing attempt', async () => {
    const db = new FakeSupabaseClient()
    seedRefundedReturn(db)
    const { easypaisa, erp } = notConfiguredProviders()
    await processReturnRefund(client(db), easypaisa, erp, RETURN_ID, actor)
    expect(db.getTable('audit_logs').some((row) => row.action === 'return.refund_processed')).toBe(true)
  })
})
