/**
 * Easypaisa payment orchestration — Phase 10.
 *
 * This module owns the full lifecycle SHAPE (initiation, callback
 * handling, refund initiation, admin reconciliation) on top of the
 * `payments`/`payment_events` schema (0007_payments.sql) that Phase 1
 * already shipped. It never talks to the real Easypaisa API itself — that
 * is `EasypaisaProvider`'s job (backend/lib/providers/easypaisa), which is
 * injected here so this file has zero Deno/env dependencies and can be
 * called from `supabase/functions/payments/index.ts` with a real,
 * env-configured provider or unit-tested with a fake one.
 *
 * Hard rule enforced throughout: nothing in this file may ever mark a
 * payment/order "paid" from a client-supplied signal. The only path to
 * `paid` is `handleEasypaisaCallback`, and only after the caller
 * (the Edge Function) has verified the webhook signature.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentProvider } from '../../../lib/providers/PaymentProvider'
import { IntegrationNotConfiguredError } from '../../../lib/providers/errors'
import { ConflictError, NotFoundError, ValidationError } from '../../../lib/errors'
import type { PaymentStatus } from '../../../lib/status'
import { getOrderForCaller } from '../../orders/orders.service'
import { recordLocalFinancialEvent } from './localFinancialEvent'
import { decidePaymentCallback, type ProviderPaymentOutcome } from '../../../lib/payments/easypaisa/callbackStateMachine'

const PROVIDER_NAME = 'easypaisa'

interface PaymentRow {
  id: string
  order_id: string
  provider: string
  provider_transaction_id: string | null
  payment_method: string | null
  amount: number
  currency: string
  status: PaymentStatus
  paid_at: string | null
  failed_at: string | null
  refunded_amount: number
}

const PAYMENT_COLUMNS =
  'id, order_id, provider, provider_transaction_id, payment_method, amount, currency, status, paid_at, failed_at, refunded_amount'

export interface PaymentSummary {
  id: string
  orderId: string
  provider: string
  providerTransactionId: string | null
  amount: number
  currency: string
  status: PaymentStatus
  paidAt: string | null
  failedAt: string | null
  refundedAmount: number
}

function mapPayment(row: PaymentRow): PaymentSummary {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    providerTransactionId: row.provider_transaction_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    paidAt: row.paid_at,
    failedAt: row.failed_at,
    refundedAmount: row.refunded_amount,
  }
}

async function findLatestEasypaisaPayment(db: SupabaseClient, orderId: string): Promise<PaymentRow | null> {
  const { data, error } = await db
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('order_id', orderId)
    .eq('provider', PROVIDER_NAME)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as PaymentRow | null) ?? null
}

async function insertPaymentEvent(
  db: SupabaseClient,
  paymentId: string,
  eventType: string,
  status: 'initiated' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded',
  rawPayload: Record<string, unknown> | null,
): Promise<void> {
  const { error } = await db.from('payment_events').insert({
    payment_id: paymentId,
    provider: PROVIDER_NAME,
    event_type: eventType,
    status,
    raw_payload: rawPayload,
  })
  if (error) throw error
}

/**
 * Start (or resume/retry) an Easypaisa payment attempt for an order the
 * caller owns. A `pending` payment row already exists from checkout
 * (orders.service.ts's createOrder) — this reuses it rather than creating a
 * second row for the same attempt. If the most recent attempt already
 * failed/was cancelled, a fresh attempt row is created instead, so retrying
 * payment against an existing order does not corrupt the history of the
 * earlier failed attempt.
 *
 * Right now (no real credentials configured), `provider.initiatePayment`
 * always throws `IntegrationNotConfiguredError`. That is caught here just
 * long enough to record the attempt outcome in `payment_events`, then
 * re-thrown unchanged — `supabase/functions/payments/index.ts`'s
 * `withErrorHandling` converts it into a clean typed 501 response the
 * frontend can show as "online payment temporarily unavailable, please use
 * COD", never a 500 crash and never a fake success.
 */
export async function initiateEasypaisaPayment(
  db: SupabaseClient,
  provider: PaymentProvider,
  input: { profileId: string; isAdmin: boolean; orderId: string; customerPhone?: string; returnUrl?: string },
): Promise<{ payment: PaymentSummary; redirectUrl?: string }> {
  const order = await getOrderForCaller(db, input.profileId, input.isAdmin, input.orderId)

  if (order.paymentMethod !== 'easypaisa') {
    throw new ValidationError('This order was not placed with Easypaisa as the payment method.')
  }
  if (order.paymentStatus === 'paid') {
    throw new ConflictError('This order has already been paid.')
  }

  let payment = await findLatestEasypaisaPayment(db, order.id)

  if (!payment || payment.status === 'failed' || payment.status === 'cancelled') {
    const { data: inserted, error } = await db
      .from('payments')
      .insert({
        order_id: order.id,
        provider: PROVIDER_NAME,
        payment_method: 'easypaisa',
        amount: order.grandTotal,
        currency: order.currency,
        status: 'pending',
      })
      .select(PAYMENT_COLUMNS)
      .single()
    if (error) throw error
    payment = inserted as PaymentRow
  }

  if (payment.status === 'paid' || payment.status === 'processing') {
    // Already paid or a provider interaction is already in flight — do not
    // start a second one. (status === 'paid' is also already guarded by
    // order.paymentStatus above, kept here too in case the two ever drift.)
    return { payment: mapPayment(payment) }
  }

  await insertPaymentEvent(db, payment.id, 'initiation_requested', 'initiated', {
    orderId: order.id,
    amount: payment.amount,
    currency: payment.currency,
  })

  try {
    const result = await provider.initiatePayment({
      orderId: order.id,
      amount: payment.amount,
      currency: payment.currency,
      customerPhone: input.customerPhone,
      returnUrl: input.returnUrl,
    })

    const { data: updated, error } = await db
      .from('payments')
      .update({ provider_transaction_id: result.providerTransactionId, status: result.status })
      .eq('id', payment.id)
      .select(PAYMENT_COLUMNS)
      .single()
    if (error) throw error

    await insertPaymentEvent(db, payment.id, 'initiation_succeeded', 'pending', {
      providerTransactionId: result.providerTransactionId,
    })

    return { payment: mapPayment(updated as PaymentRow), redirectUrl: result.redirectUrl }
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) {
      // Payment stays `pending` — this was never sent to a provider, so
      // there is nothing to reconcile. Only the attempt event records the
      // not-configured outcome.
      await insertPaymentEvent(db, payment.id, 'initiation_not_configured', 'failed', null)
    }
    throw err
  }
}

/**
 * Refund initiation — same not-configured skeleton pattern as
 * `initiateEasypaisaPayment`. Only callable against a `paid` payment.
 */
export async function refundEasypaisaPayment(
  db: SupabaseClient,
  provider: PaymentProvider,
  input: { paymentId: string; amount: number; reason?: string },
): Promise<PaymentSummary> {
  const { data, error } = await db.from('payments').select(PAYMENT_COLUMNS).eq('id', input.paymentId).maybeSingle()
  if (error) throw error
  const payment = data as PaymentRow | null
  if (!payment) throw new NotFoundError('Payment')
  if (payment.provider !== PROVIDER_NAME) throw new ValidationError('This payment was not made via Easypaisa.')
  if (payment.status !== 'paid' && payment.status !== 'partially_refunded') {
    throw new ConflictError('Only a paid payment can be refunded.')
  }
  if (input.amount <= 0 || input.amount > payment.amount - payment.refunded_amount) {
    throw new ValidationError('Refund amount must be positive and not exceed the remaining paid amount.')
  }
  if (!payment.provider_transaction_id) {
    throw new ConflictError('This payment has no provider transaction id to refund against.')
  }

  await insertPaymentEvent(db, payment.id, 'refund_requested', 'initiated', { amount: input.amount })

  try {
    const result = await provider.refundPayment({
      providerTransactionId: payment.provider_transaction_id,
      amount: input.amount,
      reason: input.reason,
    })

    const nextRefundedAmount = payment.refunded_amount + input.amount
    const nextStatus: PaymentStatus = nextRefundedAmount >= payment.amount ? 'refunded' : 'partially_refunded'

    const { data: updated, error: updateError } = await db
      .from('payments')
      .update({ refunded_amount: nextRefundedAmount, status: nextStatus })
      .eq('id', payment.id)
      .select(PAYMENT_COLUMNS)
      .single()
    if (updateError) throw updateError

    await insertPaymentEvent(db, payment.id, 'refund_succeeded', 'refunded', { providerRefundId: result.providerRefundId })
    return mapPayment(updated as PaymentRow)
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) {
      await insertPaymentEvent(db, payment.id, 'refund_not_configured', 'failed', null)
    }
    throw err
  }
}

export interface EasypaisaCallbackPayload {
  /** Best-guess generic field names — see signature.ts's header comment. Confirm against real Easypaisa docs before go-live. */
  orderId?: string
  orderReference?: string
  providerTransactionId?: string
  transactionId?: string
  status?: string
  amount?: number
}

function normalizeOutcome(status: string | undefined): ProviderPaymentOutcome {
  const normalized = (status ?? '').toLowerCase()
  if (['paid', 'success', 'succeeded', 'completed'].includes(normalized)) return 'paid'
  if (['failed', 'failure', 'declined', 'error'].includes(normalized)) return 'failed'
  if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled'
  if (['processing', 'in_progress'].includes(normalized)) return 'processing'
  return 'pending'
}

/**
 * Apply a VERIFIED (signature already checked by the caller — see
 * `signature.ts`) Easypaisa callback/webhook to the matching payment.
 * Idempotent and safe against duplicate/out-of-order delivery — see
 * `callbackStateMachine.ts` for the pure decision logic this delegates to.
 *
 * On a verified `paid` transition, this also records a local financial
 * event directly (see `localFinancialEvent.ts`'s header for why — Phase 7's
 * accounting service may not exist yet at merge time) and leaves the ERP
 * receipt sync as an explicit TODO for Phase 8.
 */
export async function handleEasypaisaCallback(
  db: SupabaseClient,
  payload: EasypaisaCallbackPayload,
): Promise<{ decision: string; paymentId: string | null }> {
  const orderId = payload.orderId ?? payload.orderReference
  const providerTransactionId = payload.providerTransactionId ?? payload.transactionId
  if (!orderId || !providerTransactionId || !payload.status || typeof payload.amount !== 'number') {
    throw new ValidationError(
      'Callback payload is missing required fields (order reference, provider transaction id, status, amount).',
    )
  }

  const { data, error } = await db
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('order_id', orderId)
    .eq('provider', PROVIDER_NAME)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const payment = data as PaymentRow | null
  if (!payment) throw new NotFoundError('Payment', 'No Easypaisa payment attempt found for this order reference.')

  const outcome = normalizeOutcome(payload.status)

  const { data: existingEvent } = await db
    .from('payment_events')
    .select('id')
    .eq('payment_id', payment.id)
    .eq('event_type', 'webhook_received')
    .contains('raw_payload', { providerTransactionId, outcome })
    .maybeSingle()

  const decision = decidePaymentCallback({
    payment: { status: payment.status, amount: payment.amount, providerTransactionId: payment.provider_transaction_id },
    incoming: { providerTransactionId, outcome, amount: payload.amount },
    alreadyRecorded: Boolean(existingEvent),
  })

  await insertPaymentEvent(db, payment.id, 'webhook_received', 'pending', {
    providerTransactionId,
    outcome,
    amountReported: payload.amount,
    decision: decision.action,
  })

  if (decision.action === 'apply') {
    const update: Record<string, unknown> = { status: decision.nextStatus, provider_transaction_id: providerTransactionId }
    if (decision.nextStatus === 'paid') update.paid_at = new Date().toISOString()
    if (decision.nextStatus === 'failed') update.failed_at = new Date().toISOString()

    const { error: updateError } = await db.from('payments').update(update).eq('id', payment.id)
    if (updateError) throw updateError

    if (decision.nextStatus === 'paid') {
      await recordLocalFinancialEvent(db, {
        orderId: payment.order_id,
        paymentId: payment.id,
        transactionType: 'sale',
        amount: payment.amount,
        currency: payment.currency,
        description: `Easypaisa payment for order ${payment.order_id}`,
      })
      // TODO(Phase 8): once LedGix ERP sync is live, create/queue the ERP
      // receipt here (e.g. insert an `erp_sync_jobs` row with
      // entity_type='payment', entity_id=payment.id) instead of leaving the
      // local record as the only trace of this sale.
    }
  }

  return { decision: decision.action, paymentId: payment.id }
}

export interface PaymentReconciliationEvent {
  id: string
  eventType: string
  status: string
  createdAt: string
  /** Allowlisted, sanitized summary only — never the raw provider payload (which may contain PII or, once configured, quasi-sensitive fields). */
  summary: { providerTransactionId?: string; outcome?: string; amountReported?: number; decision?: string } | null
}

export interface PaymentReconciliationDetail {
  payment: PaymentSummary
  events: PaymentReconciliationEvent[]
}

/**
 * Admin-facing reconciliation query. Sanitizes event history to an
 * allowlist of known-safe fields — never returns `raw_payload` verbatim,
 * so a future real integration's payload (which we don't control the shape
 * of) cannot leak unexpected sensitive fields through this endpoint.
 */
export async function getPaymentReconciliationDetail(db: SupabaseClient, paymentId: string): Promise<PaymentReconciliationDetail> {
  const { data: paymentRow, error } = await db.from('payments').select(PAYMENT_COLUMNS).eq('id', paymentId).maybeSingle()
  if (error) throw error
  if (!paymentRow) throw new NotFoundError('Payment')

  const { data: eventRows, error: eventsError } = await db
    .from('payment_events')
    .select('id, event_type, status, raw_payload, created_at')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true })
  if (eventsError) throw eventsError

  const events: PaymentReconciliationEvent[] = (eventRows ?? []).map((row) => {
    const raw = (row.raw_payload ?? null) as Record<string, unknown> | null
    return {
      id: row.id as string,
      eventType: row.event_type as string,
      status: row.status as string,
      createdAt: row.created_at as string,
      summary: raw
        ? {
            providerTransactionId: typeof raw.providerTransactionId === 'string' ? raw.providerTransactionId : undefined,
            outcome: typeof raw.outcome === 'string' ? raw.outcome : undefined,
            amountReported: typeof raw.amountReported === 'number' ? raw.amountReported : undefined,
            decision: typeof raw.decision === 'string' ? raw.decision : undefined,
          }
        : null,
    }
  })

  return { payment: mapPayment(paymentRow as PaymentRow), events }
}
