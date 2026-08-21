import { describe, expect, it } from 'vitest'
import {
  evaluateReturnEligibility,
  generateUniqueReturnNumber,
  isReturnReasonCode,
  reasonRequiresEvidence,
  returnNumberCandidate,
  ReturnNumberExhaustedError,
  RETURN_POLICY,
} from './index.ts'

describe('reason codes', () => {
  it('recognizes valid reason codes', () => {
    expect(isReturnReasonCode('damaged_in_transit')).toBe(true)
    expect(isReturnReasonCode('changed_mind')).toBe(true)
    expect(isReturnReasonCode('bogus')).toBe(false)
  })

  it('requires evidence only for item-fault reasons', () => {
    expect(reasonRequiresEvidence('damaged_in_transit')).toBe(true)
    expect(reasonRequiresEvidence('wrong_item_received')).toBe(true)
    expect(reasonRequiresEvidence('not_as_described')).toBe(true)
    expect(reasonRequiresEvidence('defective_quality')).toBe(true)
    expect(reasonRequiresEvidence('changed_mind')).toBe(false)
    expect(reasonRequiresEvidence('size_fit_issue')).toBe(false)
    expect(reasonRequiresEvidence('other')).toBe(false)
  })
})

describe('return number generation', () => {
  it('builds a RET-YYYYMMDD-XXXXXX candidate', () => {
    const date = new Date('2026-08-19T12:00:00Z')
    expect(returnNumberCandidate(date, 'abc123')).toBe('RET-20260819-ABC123')
  })

  it('retries on collision and returns the first free candidate', async () => {
    let attempts = 0
    const suffixes = ['aaa111', 'bbb222']
    const result = await generateUniqueReturnNumber(
      new Date('2026-08-19T12:00:00Z'),
      () => suffixes[attempts++] as string,
      async (candidate) => candidate === 'RET-20260819-AAA111', // first candidate collides
    )
    expect(result).toBe('RET-20260819-BBB222')
  })

  it('throws ReturnNumberExhaustedError when every candidate collides', async () => {
    await expect(
      generateUniqueReturnNumber(new Date('2026-08-19T12:00:00Z'), () => 'dupe', async () => true),
    ).rejects.toBeInstanceOf(ReturnNumberExhaustedError)
  })
})

describe('evaluateReturnEligibility', () => {
  const now = new Date('2026-08-19T00:00:00Z')
  const deliveredWithinWindow = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const deliveredOutsideWindow = new Date(now.getTime() - (RETURN_POLICY.windowDays + 1) * 24 * 60 * 60 * 1000).toISOString()

  const orderItems = [{ orderItemId: 'oi-1', purchasedQuantity: 2, alreadyRequestedQuantity: 0 }]

  it('is eligible for a delivered order within the window, valid quantity, and evidence provided when required', () => {
    const result = evaluateReturnEligibility({
      orderStatus: 'delivered',
      deliveredAt: deliveredWithinWindow,
      now,
      orderItems,
      requestedLines: [{ orderItemId: 'oi-1', quantity: 1, reasonCode: 'damaged_in_transit', hasEvidence: true }],
    })
    expect(result.eligible).toBe(true)
    expect(result.orderLevelReasons).toEqual([])
    expect(result.lines[0]!.eligible).toBe(true)
  })

  it('rejects when the order is not delivered', () => {
    const result = evaluateReturnEligibility({
      orderStatus: 'shipped',
      deliveredAt: null,
      now,
      orderItems,
      requestedLines: [{ orderItemId: 'oi-1', quantity: 1, reasonCode: 'changed_mind', hasEvidence: false }],
    })
    expect(result.eligible).toBe(false)
    expect(result.orderLevelReasons[0]).toMatch(/must be delivered/)
  })

  it('rejects when outside the return window', () => {
    const result = evaluateReturnEligibility({
      orderStatus: 'delivered',
      deliveredAt: deliveredOutsideWindow,
      now,
      orderItems,
      requestedLines: [{ orderItemId: 'oi-1', quantity: 1, reasonCode: 'changed_mind', hasEvidence: false }],
    })
    expect(result.eligible).toBe(false)
    expect(result.orderLevelReasons[0]).toMatch(/return window has closed/)
  })

  it('fails closed when delivered per status but no delivered date is on record', () => {
    const result = evaluateReturnEligibility({
      orderStatus: 'delivered',
      deliveredAt: null,
      now,
      orderItems,
      requestedLines: [{ orderItemId: 'oi-1', quantity: 1, reasonCode: 'changed_mind', hasEvidence: false }],
    })
    expect(result.eligible).toBe(false)
    expect(result.orderLevelReasons[0]).toMatch(/No delivery date/)
  })

  it('rejects a line requesting more than the remaining eligible quantity', () => {
    const result = evaluateReturnEligibility({
      orderStatus: 'delivered',
      deliveredAt: deliveredWithinWindow,
      now,
      orderItems: [{ orderItemId: 'oi-1', purchasedQuantity: 2, alreadyRequestedQuantity: 1 }],
      requestedLines: [{ orderItemId: 'oi-1', quantity: 2, reasonCode: 'changed_mind', hasEvidence: false }],
    })
    expect(result.eligible).toBe(false)
    expect(result.lines[0]!.reasons[0]).toMatch(/1 unit\(s\)/)
  })

  it('rejects a line for an order item not on the order', () => {
    const result = evaluateReturnEligibility({
      orderStatus: 'delivered',
      deliveredAt: deliveredWithinWindow,
      now,
      orderItems,
      requestedLines: [{ orderItemId: 'oi-unknown', quantity: 1, reasonCode: 'changed_mind', hasEvidence: false }],
    })
    expect(result.eligible).toBe(false)
    expect(result.lines[0]!.reasons[0]).toMatch(/not found on the order/)
  })

  it('rejects an evidence-required reason with no evidence attached', () => {
    const result = evaluateReturnEligibility({
      orderStatus: 'delivered',
      deliveredAt: deliveredWithinWindow,
      now,
      orderItems,
      requestedLines: [{ orderItemId: 'oi-1', quantity: 1, reasonCode: 'defective_quality', hasEvidence: false }],
    })
    expect(result.eligible).toBe(false)
    expect(result.lines[0]!.reasons[0]).toMatch(/requires at least one photo/)
  })

  it('rejects an empty request', () => {
    const result = evaluateReturnEligibility({
      orderStatus: 'delivered',
      deliveredAt: deliveredWithinWindow,
      now,
      orderItems,
      requestedLines: [],
    })
    expect(result.eligible).toBe(false)
  })

  it('rejects a non-positive or fractional quantity', () => {
    const result = evaluateReturnEligibility({
      orderStatus: 'delivered',
      deliveredAt: deliveredWithinWindow,
      now,
      orderItems,
      requestedLines: [{ orderItemId: 'oi-1', quantity: 0, reasonCode: 'changed_mind', hasEvidence: false }],
    })
    expect(result.eligible).toBe(false)
    expect(result.lines[0]!.reasons[0]).toMatch(/positive whole number/)
  })
})
