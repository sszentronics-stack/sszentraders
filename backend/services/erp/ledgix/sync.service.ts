/**
 * LedGix ERP sync worker — Phase 8 (LedGix ERP Integration).
 *
 * This is the real consumer of Phase 7's `listUnsyncedFinancialEvents()`
 * queue: `attemptErpSync()` takes one `local_financial_transactions` row,
 * maps it to the right ERP document action (invoice/receipt/credit_note —
 * see backend/lib/erp's `mapFinancialEventToErpAction`), resolves the
 * customer mapping when needed, and calls the injected `ErpProvider`.
 *
 * RIGHT NOW (no real LedGix credentials exist anywhere in this project):
 * every `ErpProvider` call throws `IntegrationNotConfiguredError`, which is
 * caught here, classified (backend/lib/erp's `classifyErpSyncError`), and
 * turned into `markErpSyncFailed()` with a clear "not configured" message —
 * the sync job is left `failed`/`pending` for a future retry, and the local
 * financial transaction's `ledgix_document_id`/`ledgix_document_number`
 * are NEVER written to. This file must never call `markErpSyncSucceeded()`
 * except immediately after a real `ErpProvider` call actually returned a
 * document reference — that is this phase's single most important rule.
 *
 * FUTURE STATE (once real credentials/docs exist): the exact same function
 * runs unchanged — only `LedGixErpProvider`'s method bodies need to change
 * from "throw not-configured" to "make the real HTTP call". No caller of
 * `attemptErpSync()` needs to change.
 *
 * SCHEDULING: no persistent Node process exists on Hostinger static
 * hosting, so nothing in this phase runs `runErpSyncBatch()` automatically.
 * See supabase/functions/accounting/index.ts's module doc for the two
 * serverless-compatible scheduling options (Supabase pg_cron + pg_net
 * calling a dedicated Edge Function, or an external cron hitting one) —
 * neither is wired up here, per the phase's "do not fabricate a working
 * schedule" instruction. `POST /accounting/:id/sync` (this phase's new
 * admin endpoint) is the on-demand equivalent an operator can call today.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ErpProvider } from '../../../lib/providers/ErpProvider'
import { IntegrationNotConfiguredError } from '../../../lib/providers/errors'
import { classifyErpSyncError, mapFinancialEventToErpAction } from '../../../lib/erp'
import { ServerError } from '../../../lib/errors'
import { writeAuditLog, type AuditLogWriter } from '../../../lib/audit'
import {
  getFinancialTransactionById,
  listUnsyncedFinancialEvents,
  markErpSyncFailed,
  markErpSyncInProgress,
  markErpSyncSkipped,
  markErpSyncSucceeded,
  type FinancialTransactionRecord,
} from '../../accounting/accounting.service'
import { resolveOrCreateErpCustomer } from './customer.service'

export type ErpSyncOutcome = 'succeeded' | 'failed' | 'skipped'

export interface ErpSyncAttemptResult {
  transactionId: string
  outcome: ErpSyncOutcome
  /** Present only when outcome === 'failed'. Always a controlled, sanitized message — never a raw provider payload (see this module's header). */
  error?: string
}

interface OrderRow {
  id: string
  customer_id: string | null
  order_number: string
  currency: string
  grand_total: number
  ledgix_invoice_id: string | null
  ledgix_invoice_number: string | null
}

async function getOrder(db: SupabaseClient, orderId: string): Promise<OrderRow | null> {
  const { data, error } = await db
    .from('orders')
    .select('id, customer_id, order_number, currency, grand_total, ledgix_invoice_id, ledgix_invoice_number')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw error
  return (data as OrderRow | null) ?? null
}

interface CustomerRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
}

async function getCustomer(db: SupabaseClient, customerId: string): Promise<CustomerRow | null> {
  const { data, error } = await db.from('customers').select('id, first_name, last_name, email, phone').eq('id', customerId).maybeSingle()
  if (error) throw error
  return (data as CustomerRow | null) ?? null
}

interface OrderItemRow {
  variant_id: string | null
  quantity: number
  unit_price: number
}

interface VariantRow {
  id: string
  ledgix_item_id: string | null
}

/** Line items whose variant has no ledgix_item_id yet are excluded — Phase 9 (ERP-controlled inventory) owns getting every variant mapped; this function never guesses an item id. */
async function buildInvoiceLineItems(
  db: SupabaseClient,
  orderId: string,
): Promise<Array<{ ledgixItemId: string; quantity: number; unitPrice: number }>> {
  const { data: items, error } = await db.from('order_items').select('variant_id, quantity, unit_price').eq('order_id', orderId)
  if (error) throw error
  const rows = (items ?? []) as OrderItemRow[]
  const variantIds = rows.map((r) => r.variant_id).filter((id): id is string => Boolean(id))
  if (variantIds.length === 0) return []

  const { data: variants, error: variantsError } = await db.from('product_variants').select('id, ledgix_item_id').in('id', variantIds)
  if (variantsError) throw variantsError
  const ledgixItemIdByVariant = new Map<string, string | null>()
  for (const v of (variants ?? []) as VariantRow[]) ledgixItemIdByVariant.set(v.id, v.ledgix_item_id)

  return rows
    .filter((r) => r.variant_id && ledgixItemIdByVariant.get(r.variant_id))
    .map((r) => ({ ledgixItemId: ledgixItemIdByVariant.get(r.variant_id as string) as string, quantity: r.quantity, unitPrice: r.unit_price }))
}

async function syncSaleToInvoice(db: SupabaseClient, provider: ErpProvider, transaction: FinancialTransactionRecord): Promise<void> {
  if (!transaction.orderId) throw new ServerError('A sale event with no order_id cannot be synced to an ERP invoice.')
  const order = await getOrder(db, transaction.orderId)
  if (!order) throw new ServerError(`Order "${transaction.orderId}" was not found — cannot sync its sale event to LedGix.`)

  if (!order.customer_id) {
    throw new ServerError('Guest-checkout orders have no customer to map to a LedGix customer yet — guest ERP mapping is out of scope for this phase.')
  }
  const customer = await getCustomer(db, order.customer_id)
  if (!customer) throw new ServerError(`Customer "${order.customer_id}" was not found — cannot resolve its LedGix mapping.`)

  const customerMapping = await resolveOrCreateErpCustomer(db, provider, {
    id: customer.id,
    firstName: customer.first_name,
    lastName: customer.last_name,
    email: customer.email,
    phone: customer.phone,
  })

  const lineItems = await buildInvoiceLineItems(db, order.id)

  const invoiceRef = await provider.createInvoice({
    orderId: order.id,
    ledgixCustomerId: customerMapping.ledgixCustomerId,
    lineItems,
    currency: order.currency,
  })

  const { error } = await db
    .from('orders')
    .update({ ledgix_invoice_id: invoiceRef.ledgixInvoiceId, ledgix_invoice_number: invoiceRef.ledgixInvoiceNumber })
    .eq('id', order.id)
  if (error) throw error

  await markErpSyncSucceeded(db, transaction.id, {
    ledgixDocumentId: invoiceRef.ledgixInvoiceId,
    ledgixDocumentNumber: invoiceRef.ledgixInvoiceNumber,
  })
}

async function syncPaymentToReceipt(db: SupabaseClient, provider: ErpProvider, transaction: FinancialTransactionRecord): Promise<void> {
  if (!transaction.orderId) throw new ServerError('A payment/cod_collection event with no order_id cannot be synced to an ERP receipt.')
  const order = await getOrder(db, transaction.orderId)
  if (!order?.ledgix_invoice_id) {
    throw new ServerError(
      `Order "${transaction.orderId}" has not been synced to a LedGix invoice yet — a receipt cannot be recorded against a nonexistent invoice. Sync the order's sale event first.`,
    )
  }

  const receiptRef = await provider.recordReceipt({
    ledgixInvoiceId: order.ledgix_invoice_id,
    amount: transaction.amount,
    currency: transaction.currency,
    paidAt: transaction.occurredAt,
  })

  if (transaction.paymentId) {
    const { error } = await db
      .from('payments')
      .update({ ledgix_receipt_id: receiptRef.ledgixReceiptId, ledgix_receipt_number: receiptRef.ledgixReceiptNumber })
      .eq('id', transaction.paymentId)
    if (error) throw error
  }

  await markErpSyncSucceeded(db, transaction.id, {
    ledgixDocumentId: receiptRef.ledgixReceiptId,
    ledgixDocumentNumber: receiptRef.ledgixReceiptNumber,
  })
}

async function syncToCreditNote(db: SupabaseClient, provider: ErpProvider, transaction: FinancialTransactionRecord): Promise<void> {
  if (!transaction.orderId) throw new ServerError(`A ${transaction.transactionType} event with no order_id cannot be synced to an ERP credit note.`)
  const order = await getOrder(db, transaction.orderId)

  const creditNoteRef = await provider.recordCreditNote({
    orderId: transaction.orderId,
    ledgixInvoiceId: order?.ledgix_invoice_id ?? undefined,
    amount: transaction.amount,
    currency: transaction.currency,
    reason: transaction.transactionType,
  })

  await markErpSyncSucceeded(db, transaction.id, {
    ledgixDocumentId: creditNoteRef.ledgixCreditNoteId,
    ledgixDocumentNumber: creditNoteRef.ledgixCreditNoteNumber,
  })
}

/**
 * Attempt to sync one financial transaction to LedGix ERP. Always leaves
 * the transaction's erp_sync_jobs row in a terminal-for-this-attempt state
 * (succeeded/failed/skipped) and always writes exactly one audit log entry
 * for the attempt, since triggering an ERP sync is a privileged,
 * security-sensitive action per the phase spec.
 */
export async function attemptErpSync(
  db: SupabaseClient,
  provider: ErpProvider,
  auditWriter: AuditLogWriter,
  transactionId: string,
  actor: { id: string | null; type: 'admin' | 'system' },
): Promise<ErpSyncAttemptResult> {
  const transaction = await getFinancialTransactionById(db, transactionId)
  if (!transaction) throw new ServerError(`Financial transaction "${transactionId}" was not found.`)

  const action = mapFinancialEventToErpAction(transaction.transactionType)

  if (action === 'skip') {
    const reason = `${transaction.transactionType} events are not synced as a standalone LedGix document.`
    await markErpSyncSkipped(db, transaction.id, reason)
    await writeAuditLog(auditWriter, {
      actor: actor.id,
      actorType: actor.type,
      action: 'erp.sync_attempted',
      entityType: 'local_financial_transaction',
      entityId: transaction.id,
      metadata: { transactionType: transaction.transactionType, outcome: 'skipped' },
    })
    return { transactionId: transaction.id, outcome: 'skipped' }
  }

  await markErpSyncInProgress(db, transaction.id)

  try {
    if (action === 'invoice') await syncSaleToInvoice(db, provider, transaction)
    else if (action === 'receipt') await syncPaymentToReceipt(db, provider, transaction)
    else await syncToCreditNote(db, provider, transaction)

    await writeAuditLog(auditWriter, {
      actor: actor.id,
      actorType: actor.type,
      action: 'erp.sync_attempted',
      entityType: 'local_financial_transaction',
      entityId: transaction.id,
      metadata: { transactionType: transaction.transactionType, outcome: 'succeeded' },
    })
    return { transactionId: transaction.id, outcome: 'succeeded' }
  } catch (err) {
    const errorClass = classifyErpSyncError(err)
    // Controlled, non-secret message only — IntegrationNotConfiguredError's
    // message is a static, developer-authored string (see backend/lib/providers/errors.ts);
    // ServerError messages thrown above are likewise static/non-secret. A
    // genuinely unexpected error's raw message is never stored — only a
    // generic, safe fallback is, matching backend/lib/errors's
    // toAppError() "never leak an unrecognized error's detail" rule.
    const message =
      err instanceof IntegrationNotConfiguredError || err instanceof ServerError
        ? err.message
        : `LedGix sync failed with an unexpected (${errorClass}) error. See server logs for detail.`

    await markErpSyncFailed(db, transaction.id, message)
    await writeAuditLog(auditWriter, {
      actor: actor.id,
      actorType: actor.type,
      action: 'erp.sync_attempted',
      entityType: 'local_financial_transaction',
      entityId: transaction.id,
      metadata: { transactionType: transaction.transactionType, outcome: 'failed', errorClass },
    })
    return { transactionId: transaction.id, outcome: 'failed', error: message }
  }
}

export interface ErpSyncBatchResult {
  attempted: number
  succeeded: number
  failed: number
  skipped: number
}

/**
 * Convenience batch driver over listUnsyncedFinancialEvents() —
 * runErpSyncBatch() is what a future scheduled worker (see this module's
 * header) would call on an interval. Not invoked automatically anywhere in
 * this phase; exposed so it's ready for that worker and independently
 * testable today.
 */
export async function runErpSyncBatch(
  db: SupabaseClient,
  provider: ErpProvider,
  auditWriter: AuditLogWriter,
  actor: { id: string | null; type: 'admin' | 'system' },
  limit = 25,
): Promise<ErpSyncBatchResult> {
  const unsynced = await listUnsyncedFinancialEvents(db, limit)
  const result: ErpSyncBatchResult = { attempted: 0, succeeded: 0, failed: 0, skipped: 0 }
  for (const { transaction } of unsynced) {
    result.attempted += 1
    const outcome = await attemptErpSync(db, provider, auditWriter, transaction.id, actor)
    result[outcome.outcome] += 1
  }
  return result
}
