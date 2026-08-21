/**
 * Pure decision logic for handling an Easypaisa payment callback/webhook.
 * Deliberately has no I/O (no Supabase client, no fetch) so it can be
 * exhaustively unit tested for the required scenarios: duplicate callback,
 * out-of-order/late callback, amount mismatch, and normal forward
 * transitions — without a live database.
 *
 * `easypaisa.service.ts` is the thin orchestration layer that loads the
 * current payment row, calls `decidePaymentCallback`, and applies the
 * resulting action.
 */
import type { PaymentStatus } from '../../status/index.ts'

/** The generic provider-reported outcome a callback/webhook or verifyPayment() call can carry. */
export type ProviderPaymentOutcome = 'paid' | 'failed' | 'pending' | 'processing' | 'cancelled'

/** Statuses from which no further callback should ever change the payment — the record is settled. */
const TERMINAL_STATUSES: readonly PaymentStatus[] = ['paid', 'failed', 'cancelled', 'refunded', 'partially_refunded']

function mapOutcomeToPaymentStatus(outcome: ProviderPaymentOutcome): PaymentStatus {
  switch (outcome) {
    case 'paid':
      return 'paid'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'processing':
      return 'processing'
    case 'pending':
    default:
      return 'pending'
  }
}

export interface CallbackPaymentSnapshot {
  status: PaymentStatus
  amount: number // minor units, authoritative local amount
  providerTransactionId: string | null
}

export interface CallbackIncomingEvent {
  providerTransactionId: string
  outcome: ProviderPaymentOutcome
  amount: number // minor units, as reported by the provider payload
}

export type CallbackDecision =
  | { action: 'apply'; nextStatus: PaymentStatus }
  | { action: 'duplicate_ack' } // exact same (providerTransactionId, outcome) already processed — ack, no state change
  | { action: 'ignore_stale' } // payment already in a terminal state; this callback can no longer change anything
  | { action: 'reject_amount_mismatch' } // reported amount does not match the local payment amount — never apply
  | { action: 'reject_transaction_mismatch' } // payment already bound to a different provider transaction id

export interface DecidePaymentCallbackInput {
  payment: CallbackPaymentSnapshot
  incoming: CallbackIncomingEvent
  /** True if payment_events already contains a row for this exact (providerTransactionId, outcome) pair. */
  alreadyRecorded: boolean
}

/**
 * Decide what a callback should do to a payment, given its current state
 * and event history. Never returns an action that would let a client-only
 * signal mark an order paid — this is only ever called after the caller
 * has independently verified the webhook signature.
 */
export function decidePaymentCallback(input: DecidePaymentCallbackInput): CallbackDecision {
  const { payment, incoming } = input

  if (payment.providerTransactionId && payment.providerTransactionId !== incoming.providerTransactionId) {
    return { action: 'reject_transaction_mismatch' }
  }

  if (incoming.amount !== payment.amount) {
    return { action: 'reject_amount_mismatch' }
  }

  if (input.alreadyRecorded) {
    return { action: 'duplicate_ack' }
  }

  if (TERMINAL_STATUSES.includes(payment.status)) {
    // Payment already settled (e.g. already 'paid'). A late/out-of-order
    // 'pending' or 'processing' callback arriving after the terminal
    // outcome must never downgrade it. A repeat of the SAME terminal
    // outcome would have been caught by `alreadyRecorded` above; anything
    // else here is stale and is safely ignored (still logged by the
    // caller for audit purposes).
    return { action: 'ignore_stale' }
  }

  return { action: 'apply', nextStatus: mapOutcomeToPaymentStatus(incoming.outcome) }
}
