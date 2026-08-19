import { describe, expect, it } from 'vitest'
import { buildOrderItemSnapshots, deliveryCost, generateUniqueOrderNumber, orderNumberCandidate } from './index.ts'

describe('orderNumberCandidate', () => {
  it('formats a human-friendly, date-prefixed order number', () => {
    const date = new Date('2026-08-19T10:00:00Z')
    expect(orderNumberCandidate(date, 'ab12cd')).toBe('AURA-20260819-AB12CD')
  })
})

describe('generateUniqueOrderNumber', () => {
  const now = new Date('2026-08-19T10:00:00Z')

  it('returns the first candidate when it does not already exist', async () => {
    const result = await generateUniqueOrderNumber(now, () => 'AAAAAA', async () => false)
    expect(result).toBe('AURA-20260819-AAAAAA')
  })

  it('retries with a fresh suffix on collision', async () => {
    let calls = 0
    const suffixes = ['AAAAAA', 'BBBBBB', 'CCCCCC']
    const result = await generateUniqueOrderNumber(
      now,
      () => suffixes[calls++] ?? 'ZZZZZZ',
      async (candidate) => candidate !== 'AURA-20260819-CCCCCC',
    )
    expect(result).toBe('AURA-20260819-CCCCCC')
  })

  it('throws once max attempts are exhausted', async () => {
    await expect(generateUniqueOrderNumber(now, () => 'AAAAAA', async () => true)).rejects.toThrow(
      /Could not generate a unique order number/,
    )
  })
})

describe('buildOrderItemSnapshots', () => {
  it('snapshots product/variant/price and computes line totals', () => {
    const result = buildOrderItemSnapshots([
      {
        productId: 'p1',
        variantId: 'v1',
        sku: 'SKU-1',
        productName: 'Collagen Mask',
        variantTitle: '25g',
        quantity: 2,
        unitPrice: 12900,
        compareAtPrice: 19900,
      },
    ])
    expect(result).toEqual([
      {
        productId: 'p1',
        variantId: 'v1',
        sku: 'SKU-1',
        productName: 'Collagen Mask',
        variantName: '25g',
        quantity: 2,
        unitPrice: 12900,
        originalPrice: 19900,
        discountAmount: 0,
        lineTotal: 25800,
      },
    ])
  })

  it('does not set originalPrice when there is no genuine markdown', () => {
    const [item] = buildOrderItemSnapshots([
      {
        productId: 'p1',
        variantId: 'v1',
        sku: 'SKU-1',
        productName: 'Toner',
        variantTitle: null,
        quantity: 1,
        unitPrice: 7900,
        compareAtPrice: 5000, // lower than unitPrice — not a real markdown
      },
    ])
    expect(item!.originalPrice).toBeNull()
  })

  it('handles multiple lines independently', () => {
    const result = buildOrderItemSnapshots([
      { productId: 'p1', variantId: 'v1', sku: 'S1', productName: 'A', variantTitle: null, quantity: 1, unitPrice: 100, compareAtPrice: null },
      { productId: 'p2', variantId: 'v2', sku: 'S2', productName: 'B', variantTitle: null, quantity: 3, unitPrice: 200, compareAtPrice: null },
    ])
    expect(result).toHaveLength(2)
    expect(result[1]!.lineTotal).toBe(600)
  })
})

describe('deliveryCost', () => {
  it('returns the flat rate for each method', () => {
    expect(deliveryCost('standard')).toBe(20000)
    expect(deliveryCost('express')).toBe(40000)
  })
})
