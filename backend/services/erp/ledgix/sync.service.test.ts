import { describe, expect, it } from 'vitest'
import type {
  CreateInvoiceInput,
  ErpCreditNoteRef,
  ErpCustomerRef,
  ErpInvoiceRef,
  ErpInventorySnapshot,
  ErpProvider,
  ErpReceiptRef,
  RecordCreditNoteInput,
  RecordReceiptInput,
  UpsertCustomerInput,
} from '../../../lib/providers/ErpProvider'
import { LedGixErpProvider } from '../../../lib/providers/ledgix/LedGixErpProvider'
import {
  recordCancellationTransaction,
  recordPaymentTransaction,
  recordSaleTransaction,
} from '../../accounting/accounting.service'
import { attemptErpSync, runErpSyncBatch } from './sync.service'
import { FakeSupabaseClient, asAuditWriter } from './testUtils'

function asSupabase(db: FakeSupabaseClient) {
  return db as unknown as import('@supabase/supabase-js').SupabaseClient
}

const actor = { id: 'admin-1', type: 'admin' as const }

class FakeSucceedingProvider implements ErpProvider {
  readonly name = 'fake-ledgix'
  async upsertCustomer(input: UpsertCustomerInput): Promise<ErpCustomerRef> {
    return { ledgixCustomerId: `ledgix-${input.customerId}` }
  }
  async createInvoice(input: CreateInvoiceInput): Promise<ErpInvoiceRef> {
    return { ledgixInvoiceId: `inv-${input.orderId}`, ledgixInvoiceNumber: `INV-${input.orderId}` }
  }
  async recordReceipt(input: RecordReceiptInput): Promise<ErpReceiptRef> {
    return { ledgixReceiptId: `rcpt-${input.ledgixInvoiceId}`, ledgixReceiptNumber: `RCPT-${input.ledgixInvoiceId}` }
  }
  async recordCreditNote(input: RecordCreditNoteInput): Promise<ErpCreditNoteRef> {
    return { ledgixCreditNoteId: `cn-${input.orderId}`, ledgixCreditNoteNumber: `CN-${input.orderId}` }
  }
  async getInventorySnapshot(_ids: string[]): Promise<ErpInventorySnapshot[]> {
    return []
  }
}

function seedOrderWithCustomerAndItems(db: FakeSupabaseClient, orderId: string, customerId: string) {
  db.seed('orders', [
    {
      id: orderId,
      customer_id: customerId,
      order_number: `AURA-${orderId}`,
      currency: 'PKR',
      grand_total: 5000,
      ledgix_invoice_id: null,
      ledgix_invoice_number: null,
    },
  ])
  db.seed('customers', [{ id: customerId, first_name: 'Ayesha', last_name: 'Khan', email: null, phone: null, ledgix_customer_id: null }])
  db.seed('order_items', [{ order_id: orderId, variant_id: 'variant-1', quantity: 2, unit_price: 2500 }])
  db.seed('product_variants', [{ id: 'variant-1', ledgix_item_id: 'item-1' }])
}

describe('attemptErpSync — not configured (today\'s actual state)', () => {
  it('a sale event fails safely with a clear not-configured message and never fabricates an invoice', async () => {
    const db = new FakeSupabaseClient()
    seedOrderWithCustomerAndItems(db, 'order-1', 'cust-1')
    const tx = await recordSaleTransaction(asSupabase(db), { id: 'order-1', currency: 'PKR', grandTotal: 5000 })

    const result = await attemptErpSync(asSupabase(db), new LedGixErpProvider(null), asAuditWriter(db), tx.id, actor)

    expect(result.outcome).toBe('failed')
    expect(result.error).toMatch(/not configured/i)

    const job = db.getTable('erp_sync_jobs').find((j) => j.entity_id === tx.id)
    expect(job?.status).toBe('failed')

    const storedTx = db.getTable('local_financial_transactions').find((r) => r.id === tx.id)
    expect(storedTx?.ledgix_document_id).toBeFalsy()

    const order = db.getTable('orders').find((o) => o.id === 'order-1')
    expect(order?.ledgix_invoice_id).toBeFalsy()

    const auditLogs = db.getTable('audit_logs')
    expect(auditLogs).toHaveLength(1)
    expect(auditLogs[0]?.action).toBe('erp.sync_attempted')
  })

  it('discount/delivery_charge events are skipped, never attempted against the provider', async () => {
    const db = new FakeSupabaseClient()
    // recordDiscountTransaction isn't imported here to keep the test focused
    // on the sync-worker's skip branch — insert a matching row directly via
    // the accounting service's cancellation helper is wrong semantics, so
    // seed the transaction row directly instead.
    db.seed('local_financial_transactions', [
      { id: 'tx-discount', transaction_type: 'discount', amount: 500, currency: 'PKR', order_id: 'order-2', occurred_at: new Date().toISOString() },
    ])

    const result = await attemptErpSync(asSupabase(db), new LedGixErpProvider(null), asAuditWriter(db), 'tx-discount', actor)
    expect(result.outcome).toBe('skipped')
    const job = db.getTable('erp_sync_jobs').find((j) => j.entity_id === 'tx-discount')
    expect(job?.status).toBe('skipped')
  })
})

describe('attemptErpSync — hypothetical future-state success path (fake provider)', () => {
  it('syncs a sale to an invoice, resolves the customer mapping, and stamps ERP references', async () => {
    const db = new FakeSupabaseClient()
    seedOrderWithCustomerAndItems(db, 'order-3', 'cust-3')
    const tx = await recordSaleTransaction(asSupabase(db), { id: 'order-3', currency: 'PKR', grandTotal: 5000 })

    const result = await attemptErpSync(asSupabase(db), new FakeSucceedingProvider(), asAuditWriter(db), tx.id, actor)

    expect(result.outcome).toBe('succeeded')
    const order = db.getTable('orders').find((o) => o.id === 'order-3')
    expect(order?.ledgix_invoice_id).toBe('inv-order-3')
    const storedTx = db.getTable('local_financial_transactions').find((r) => r.id === tx.id)
    expect(storedTx?.ledgix_document_id).toBe('inv-order-3')
    const customer = db.getTable('customers').find((c) => c.id === 'cust-3')
    expect(customer?.ledgix_customer_id).toBe('ledgix-cust-3')
  })

  it('a payment cannot sync to a receipt before its order has a LedGix invoice', async () => {
    const db = new FakeSupabaseClient()
    seedOrderWithCustomerAndItems(db, 'order-4', 'cust-4')
    const payment = await recordPaymentTransaction(asSupabase(db), { id: 'payment-4', orderId: 'order-4', currency: 'PKR', amount: 5000 })

    const result = await attemptErpSync(asSupabase(db), new FakeSucceedingProvider(), asAuditWriter(db), payment.id, actor)
    expect(result.outcome).toBe('failed')
    expect(result.error).toMatch(/has not been synced to a LedGix invoice/i)
  })

  it('syncs a payment to a receipt once the order already has an invoice', async () => {
    const db = new FakeSupabaseClient()
    seedOrderWithCustomerAndItems(db, 'order-5', 'cust-5')
    const orderRow = db.getTable('orders')[0]!
    orderRow.ledgix_invoice_id = 'inv-order-5'
    orderRow.ledgix_invoice_number = 'INV-order-5'
    db.seed('payments', [{ id: 'payment-5', order_id: 'order-5', ledgix_receipt_id: null, ledgix_receipt_number: null }])
    const payment = await recordPaymentTransaction(asSupabase(db), { id: 'payment-5', orderId: 'order-5', currency: 'PKR', amount: 5000 })

    const result = await attemptErpSync(asSupabase(db), new FakeSucceedingProvider(), asAuditWriter(db), payment.id, actor)
    expect(result.outcome).toBe('succeeded')
    const paymentRow = db.getTable('payments').find((p) => p.id === 'payment-5')
    expect(paymentRow?.ledgix_receipt_id).toBe('rcpt-inv-order-5')
  })

  it('syncs a cancellation to a credit note', async () => {
    const db = new FakeSupabaseClient()
    seedOrderWithCustomerAndItems(db, 'order-6', 'cust-6')
    const cancellation = await recordCancellationTransaction(asSupabase(db), { id: 'order-6', currency: 'PKR', grandTotal: 5000 })

    const result = await attemptErpSync(asSupabase(db), new FakeSucceedingProvider(), asAuditWriter(db), cancellation.id, actor)
    expect(result.outcome).toBe('succeeded')
    const storedTx = db.getTable('local_financial_transactions').find((r) => r.id === cancellation.id)
    expect(storedTx?.ledgix_document_id).toBe('cn-order-6')
  })
})

describe('runErpSyncBatch', () => {
  it('attempts every unsynced event and reports outcome counts (all failed, since nothing is configured)', async () => {
    const db = new FakeSupabaseClient()
    seedOrderWithCustomerAndItems(db, 'order-7', 'cust-7')
    seedOrderWithCustomerAndItems(db, 'order-8', 'cust-8')
    await recordSaleTransaction(asSupabase(db), { id: 'order-7', currency: 'PKR', grandTotal: 5000 })
    await recordSaleTransaction(asSupabase(db), { id: 'order-8', currency: 'PKR', grandTotal: 5000 })

    const result = await runErpSyncBatch(asSupabase(db), new LedGixErpProvider(null), asAuditWriter(db), actor)
    expect(result.attempted).toBe(2)
    expect(result.failed).toBe(2)
    expect(result.succeeded).toBe(0)
  })
})
