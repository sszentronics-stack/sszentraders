/**
 * Financial refund execution for a resolved return — Phase 14 (Reviews,
 * Returns & Customer Service). Deliberately separate from returns.service.ts
 * ("decide the outcome") so this file only ever runs AFTER a return has
 * already reached `refunded` with resolution = 'refund' via
 * recordInspectionOutcome().
 *
 * Reuses every piece of prior-phase machinery rather than rebuilding it:
 *   - backend/services/accounting/accounting.service.ts (Phase 7) — the
 *     ONLY local_financial_transactions writer in this codebase. This file
 *     never inserts into that table directly.
 *   - backend/services/payments/easypaisa/easypaisa.service.ts's
 *     refundEasypaisaPayment (Phase 10) for an Easypaisa-paid order.
 *   - backend/services/erp/ledgix/sync.service.ts's attemptErpSync
 *     (Phase 8) for the LedGix credit note — 'refund' already maps to
 *     'credit_note' via backend/lib/erp's mapFinancialEventToErpAction, so
 *     no new ERP mapping logic is added here.
 *
 * Nothing here fabricates a provider reference or an ERP document number —
 * every real call still throws IntegrationNotConfiguredError until real
 * Easypaisa/LedGix credentials exist, exactly as every other phase's
 * refund/sync code already behaves. What DOES always happen is the local
 * financial event — "Aura believes this refund is owed/was issued" — same
 * local-first philosophy as every other accounting event in this codebase.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentProvider } from '../../lib/providers/PaymentProvider'
import type { ErpProvider } from '../../lib/providers/ErpProvider'
import { ConflictError, NotFoundError } from '../../lib/errors'
import { writeAuditLog, type AuditLogWriter } from '../../lib/audit'
import { recordRefundTransaction, getFinancialTransactionById } from '../accounting/accounting.service'
import { refundEasypaisaPayment } from '../payments/easypaisa/easypaisa.service'
import { attemptErpSync } from '../erp/ledgix/sync.service'
import type { AdminActor } from './returns.service'

interface ReturnRowForRefund {
  id: string
  order_id: string
  return_number: string
  status: string
  resolution: string | null
  refund_amount: number | null
}

interface OrderRowForRefund {
  id: string
  order_number: string
  currency: string
}

interface PaymentRowForRefund {
  id: string
  order_id: string
  provider: string
  status: string
  amount: number
  currency: string
  refunded_amount: number
}

export interface ProcessReturnRefundResult {
  refundMethod: 'easypaisa' | 'manual'
  refundTransactionId: string
  easypaisaAttempted: boolean
  easypaisaError: string | null
  erpSyncOutcome: 'succeeded' | 'failed' | 'skipped'
  ledgixCreditNoteId: string | null
  ledgixCreditNoteNumber: string | null
}

/**
 * Run the full refund flow for a return that just reached
 * `refunded`/resolution='refund'. Idempotent in the same sense every
 * accounting.service function is: recordReturnTransaction/
 * recordRefundTransaction are keyed by (returnId)/(paymentId, returnId), so
 * calling this twice for the same return never double-records the local
 * financial events, and re-attempting the Easypaisa/ERP calls is exactly
 * the retry behavior Phase 8/10 already designed for.
 */
export async function processReturnRefund(
  db: SupabaseClient & AuditLogWriter,
  easypaisaProvider: PaymentProvider,
  erpProvider: ErpProvider,
  returnId: string,
  actor: AdminActor,
): Promise<ProcessReturnRefundResult> {
  const { data: returnRow, error: returnError } = await db
    .from('returns')
    .select('id, order_id, return_number, status, resolution, refund_amount')
    .eq('id', returnId)
    .maybeSingle()
  if (returnError) throw returnError
  const ret = returnRow as ReturnRowForRefund | null
  if (!ret) throw new NotFoundError('Return')
  if (ret.resolution !== 'refund' || ret.status !== 'refunded' || !ret.refund_amount) {
    throw new ConflictError(`Return "${ret.return_number}" is not in a refund-ready state (status/resolution must be "refunded"/"refund" with a refund amount set).`)
  }

  const { data: orderRow, error: orderError } = await db.from('orders').select('id, order_number, currency').eq('id', ret.order_id).maybeSingle()
  if (orderError) throw orderError
  const order = orderRow as OrderRowForRefund | null
  if (!order) throw new NotFoundError('Order')

  const { data: paymentRow, error: paymentError } = await db
    .from('payments')
    .select('id, order_id, provider, status, amount, currency, refunded_amount')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (paymentError) throw paymentError
  const payment = paymentRow as PaymentRowForRefund | null

  const refundMethod: 'easypaisa' | 'manual' =
    payment && payment.provider === 'easypaisa' && (payment.status === 'paid' || payment.status === 'partially_refunded') ? 'easypaisa' : 'manual'

  // 1. Local-first: the refund event (money is owed/being returned) is
  // recorded regardless of whether the downstream Easypaisa/LedGix calls
  // below succeed — same philosophy as every other Phase 7 event. The
  // "goods physically returned" event was already recorded by
  // returns.service.ts's recordInspectionOutcome() right before this
  // function is called.
  const refundTransaction = await recordRefundTransaction(
    db,
    payment
      ? { id: payment.id, orderId: order.id, currency: order.currency, amount: payment.amount }
      : { id: ret.id, orderId: order.id, currency: order.currency, amount: ret.refund_amount },
    ret.id,
    ret.refund_amount,
    'reviews.refund.processReturnRefund',
  )

  // 2. Easypaisa refund attempt, only when applicable. Reuses Phase 10's
  // service wholesale — never re-implements payment-provider orchestration.
  let easypaisaAttempted = false
  let easypaisaError: string | null = null
  if (refundMethod === 'easypaisa' && payment) {
    easypaisaAttempted = true
    try {
      await refundEasypaisaPayment(db, easypaisaProvider, { paymentId: payment.id, amount: ret.refund_amount, reason: `Return ${ret.return_number}` })
    } catch (err) {
      easypaisaError = err instanceof Error ? err.message : String(err)
    }
  }

  await db
    .from('returns')
    .update({ refund_method: refundMethod, refund_payment_id: payment?.id ?? null })
    .eq('id', ret.id)

  // 3. LedGix credit note — reuses Phase 8's real sync worker unchanged.
  // 'refund' already maps to 'credit_note' (backend/lib/erp's
  // mapFinancialEventToErpAction); no new ERP mapping/document logic exists
  // here. Never fabricates a reference: markErpSyncSucceeded (inside
  // attemptErpSync) only ever stamps a real provider-returned id/number.
  const syncResult = await attemptErpSync(db, erpProvider, db, refundTransaction.id, { id: actor.profileId, type: 'admin' })

  let ledgixCreditNoteId: string | null = null
  let ledgixCreditNoteNumber: string | null = null
  if (syncResult.outcome === 'succeeded') {
    const synced = await getFinancialTransactionById(db, refundTransaction.id)
    ledgixCreditNoteId = synced?.ledgixDocumentId ?? null
    ledgixCreditNoteNumber = synced?.ledgixDocumentNumber ?? null
    if (ledgixCreditNoteId && ledgixCreditNoteNumber) {
      await db
        .from('returns')
        .update({ ledgix_credit_note_id: ledgixCreditNoteId, ledgix_credit_note_number: ledgixCreditNoteNumber })
        .eq('id', ret.id)
    }
  }

  await writeAuditLog(db, {
    actor: actor.profileId,
    actorType: 'admin',
    action: 'return.refund_processed',
    entityType: 'return',
    entityId: ret.id,
    metadata: { refundMethod, easypaisaAttempted, erpSyncOutcome: syncResult.outcome, refundAmount: ret.refund_amount },
  })

  return {
    refundMethod,
    refundTransactionId: refundTransaction.id,
    easypaisaAttempted,
    easypaisaError,
    erpSyncOutcome: syncResult.outcome,
    ledgixCreditNoteId,
    ledgixCreditNoteNumber,
  }
}
