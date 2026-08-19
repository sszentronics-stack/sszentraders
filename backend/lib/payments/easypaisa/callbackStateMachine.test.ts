import { describe, expect, it } from 'vitest'
import { decidePaymentCallback } from './callbackStateMachine.ts'

const basePayment = { status: 'pending' as const, amount: 12900, providerTransactionId: null }
const baseIncoming = { providerTransactionId: 'txn-1', outcome: 'paid' as const, amount: 12900 }

describe('decidePaymentCallback', () => {
  it('applies a forward transition (pending -> paid) on first delivery', () => {
    const decision = decidePaymentCallback({ payment: basePayment, incoming: baseIncoming, alreadyRecorded: false })
    expect(decision).toEqual({ action: 'apply', nextStatus: 'paid' })
  })

  it('applies pending -> processing', () => {
    const decision = decidePaymentCallback({
      payment: basePayment,
      incoming: { ...baseIncoming, outcome: 'processing' },
      alreadyRecorded: false,
    })
    expect(decision).toEqual({ action: 'apply', nextStatus: 'processing' })
  })

  it('applies pending -> failed', () => {
    const decision = decidePaymentCallback({
      payment: basePayment,
      incoming: { ...baseIncoming, outcome: 'failed' },
      alreadyRecorded: false,
    })
    expect(decision).toEqual({ action: 'apply', nextStatus: 'failed' })
  })

  it('applies pending -> cancelled', () => {
    const decision = decidePaymentCallback({
      payment: basePayment,
      incoming: { ...baseIncoming, outcome: 'cancelled' },
      alreadyRecorded: false,
    })
    expect(decision).toEqual({ action: 'apply', nextStatus: 'cancelled' })
  })

  it('acknowledges a duplicate delivery of the same (transaction id, outcome) without re-applying', () => {
    const decision = decidePaymentCallback({
      payment: { ...basePayment, status: 'paid', providerTransactionId: 'txn-1' },
      incoming: baseIncoming,
      alreadyRecorded: true,
    })
    expect(decision).toEqual({ action: 'duplicate_ack' })
  })

  it('ignores a late/out-of-order callback after the payment already reached a terminal state', () => {
    // Payment already settled as 'paid'; a late 'pending' status update (e.g.
    // network retry from the provider queued before the 'paid' event) must
    // never downgrade it back to pending.
    const decision = decidePaymentCallback({
      payment: { status: 'paid', amount: 12900, providerTransactionId: 'txn-1' },
      incoming: { providerTransactionId: 'txn-1', outcome: 'pending', amount: 12900 },
      alreadyRecorded: false,
    })
    expect(decision).toEqual({ action: 'ignore_stale' })
  })

  it('rejects when the reported amount does not match the local payment amount', () => {
    const decision = decidePaymentCallback({
      payment: basePayment,
      incoming: { ...baseIncoming, amount: 5000 },
      alreadyRecorded: false,
    })
    expect(decision).toEqual({ action: 'reject_amount_mismatch' })
  })

  it('rejects when the payment is already bound to a different provider transaction id', () => {
    const decision = decidePaymentCallback({
      payment: { ...basePayment, providerTransactionId: 'txn-original' },
      incoming: { ...baseIncoming, providerTransactionId: 'txn-different' },
      alreadyRecorded: false,
    })
    expect(decision).toEqual({ action: 'reject_transaction_mismatch' })
  })

  it('amount mismatch is checked before transaction-mismatch is masked by a duplicate flag', () => {
    // Even if a caller mistakenly marks this as "already recorded", an
    // amount mismatch must still win — never apply a mismatched amount.
    const decision = decidePaymentCallback({
      payment: basePayment,
      incoming: { ...baseIncoming, amount: 1 },
      alreadyRecorded: true,
    })
    expect(decision).toEqual({ action: 'reject_amount_mismatch' })
  })
})
