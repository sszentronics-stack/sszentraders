import { describe, expect, it } from 'vitest'
import { computeCartSubtotal, mergeCartLines, revalidateCartLine, trimToMostRecent } from './index'

describe('mergeCartLines', () => {
  it('sums quantities for the same variant across both lists', () => {
    const result = mergeCartLines([{ variantId: 'a', quantity: 2 }], [{ variantId: 'a', quantity: 3 }])
    expect(result).toEqual([{ variantId: 'a', quantity: 5 }])
  })

  it('keeps variants that only appear in one list', () => {
    const result = mergeCartLines([{ variantId: 'a', quantity: 1 }], [{ variantId: 'b', quantity: 1 }])
    expect(result).toEqual(
      expect.arrayContaining([
        { variantId: 'a', quantity: 1 },
        { variantId: 'b', quantity: 1 },
      ]),
    )
  })

  it('caps merged quantity at the max line quantity', () => {
    const result = mergeCartLines([{ variantId: 'a', quantity: 700 }], [{ variantId: 'a', quantity: 700 }])
    expect(result[0]?.quantity).toBe(999)
  })

  it('handles empty inputs', () => {
    expect(mergeCartLines([], [])).toEqual([])
    expect(mergeCartLines([{ variantId: 'a', quantity: 1 }], [])).toEqual([{ variantId: 'a', quantity: 1 }])
  })
})

describe('revalidateCartLine', () => {
  const publishedVariant = { id: 'v1', price: 12900, status: 'published' as const, productStatus: 'published' as const }

  it('drops the line when the variant no longer exists', () => {
    const result = revalidateCartLine({ requestedQuantity: 1, variant: null })
    expect(result.keep).toBe(false)
    if (!result.keep) expect(result.reason).toBe('variant_unavailable')
  })

  it('drops the line when the variant is archived/draft', () => {
    const result = revalidateCartLine({
      requestedQuantity: 1,
      variant: { ...publishedVariant, status: 'archived' },
    })
    expect(result.keep).toBe(false)
    if (!result.keep) expect(result.reason).toBe('variant_unavailable')
  })

  it('drops the line when the product is unpublished', () => {
    const result = revalidateCartLine({
      requestedQuantity: 1,
      variant: { ...publishedVariant, productStatus: 'draft' },
    })
    expect(result.keep).toBe(false)
    if (!result.keep) expect(result.reason).toBe('product_unavailable')
  })

  it('keeps a valid line and computes its total from the live price, not any client-supplied price', () => {
    const result = revalidateCartLine({ requestedQuantity: 2, variant: publishedVariant, previousUnitPrice: 9900 })
    expect(result.keep).toBe(true)
    if (result.keep) {
      expect(result.unitPrice).toBe(12900)
      expect(result.lineTotal).toBe(25800)
      expect(result.priceChanged).toBe(true)
    }
  })

  it('reports no price change when the snapshot matches the live price', () => {
    const result = revalidateCartLine({ requestedQuantity: 1, variant: publishedVariant, previousUnitPrice: 12900 })
    expect(result.keep).toBe(true)
    if (result.keep) expect(result.priceChanged).toBe(false)
  })

  it('clamps quantity into [1, 999]', () => {
    const low = revalidateCartLine({ requestedQuantity: 0, variant: publishedVariant })
    const high = revalidateCartLine({ requestedQuantity: 5000, variant: publishedVariant })
    expect(low.keep && low.quantity).toBe(1)
    expect(high.keep && high.quantity).toBe(999)
  })
})

describe('computeCartSubtotal', () => {
  it('sums line totals', () => {
    expect(computeCartSubtotal([{ lineTotal: 100 }, { lineTotal: 250 }])).toBe(350)
  })

  it('is 0 for an empty cart', () => {
    expect(computeCartSubtotal([])).toBe(0)
  })
})

describe('trimToMostRecent', () => {
  it('keeps only the most recent N, newest first', () => {
    const items = [
      { id: 'a', viewedAt: '2026-08-01T00:00:00Z' },
      { id: 'b', viewedAt: '2026-08-03T00:00:00Z' },
      { id: 'c', viewedAt: '2026-08-02T00:00:00Z' },
    ]
    expect(trimToMostRecent(items, 2).map((i) => i.id)).toEqual(['b', 'c'])
  })
})
