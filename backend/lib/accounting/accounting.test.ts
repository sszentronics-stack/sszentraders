import { describe, expect, it } from 'vitest'
import {
  FINANCIAL_TRANSACTION_SEMANTICS,
  FINANCIAL_TRANSACTION_TYPES,
  buildFinancialEventIdempotencyKey,
  isFinancialTransactionType,
  isUnsyncedFinancialEventState,
} from './index'

describe('FINANCIAL_TRANSACTION_TYPES', () => {
  it('has documented debit/credit semantics for every type', () => {
    for (const type of FINANCIAL_TRANSACTION_TYPES) {
      expect(FINANCIAL_TRANSACTION_SEMANTICS[type]).toBeTruthy()
    }
  })
})

describe('isFinancialTransactionType', () => {
  it('accepts every defined type', () => {
    for (const type of FINANCIAL_TRANSACTION_TYPES) {
      expect(isFinancialTransactionType(type)).toBe(true)
    }
  })

  it('rejects an unknown type', () => {
    expect(isFinancialTransactionType('invoice')).toBe(false)
  })
})

describe('buildFinancialEventIdempotencyKey', () => {
  it('is deterministic for the same type/entity/suffix', () => {
    const a = buildFinancialEventIdempotencyKey('sale', 'order-1')
    const b = buildFinancialEventIdempotencyKey('sale', 'order-1')
    expect(a).toBe(b)
  })

  it('differs by event type for the same entity (a sale and a cancellation on the same order do not collide)', () => {
    const sale = buildFinancialEventIdempotencyKey('sale', 'order-1')
    const cancellation = buildFinancialEventIdempotencyKey('cancellation', 'order-1')
    expect(sale).not.toBe(cancellation)
  })

  it('differs by entity id for the same event type', () => {
    const a = buildFinancialEventIdempotencyKey('payment', 'payment-1')
    const b = buildFinancialEventIdempotencyKey('payment', 'payment-2')
    expect(a).not.toBe(b)
  })

  it('supports an optional suffix for events that can legitimately repeat per entity (e.g. multiple partial refunds)', () => {
    const first = buildFinancialEventIdempotencyKey('refund', 'payment-1', 'attempt-1')
    const second = buildFinancialEventIdempotencyKey('refund', 'payment-1', 'attempt-2')
    expect(first).not.toBe(second)
  })
})

describe('isUnsyncedFinancialEventState', () => {
  it('flags pending, failed, and in_progress as needing attention', () => {
    expect(isUnsyncedFinancialEventState({ status: 'pending', attempts: 0 })).toBe(true)
    expect(isUnsyncedFinancialEventState({ status: 'failed', attempts: 3 })).toBe(true)
    expect(isUnsyncedFinancialEventState({ status: 'in_progress', attempts: 1 })).toBe(true)
  })

  it('does not flag succeeded or skipped', () => {
    expect(isUnsyncedFinancialEventState({ status: 'succeeded', attempts: 1 })).toBe(false)
    expect(isUnsyncedFinancialEventState({ status: 'skipped', attempts: 0 })).toBe(false)
  })
})
