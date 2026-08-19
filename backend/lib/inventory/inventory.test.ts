import { describe, expect, it } from 'vitest'
import {
  assessCheckoutAvailability,
  buildInventoryCacheUpserts,
  computeAvailabilityState,
  isInventoryCacheStale,
} from './index.ts'

describe('computeAvailabilityState', () => {
  it('is unknown with no cache data', () => {
    expect(computeAvailabilityState(null)).toBe('unknown')
    expect(computeAvailabilityState(undefined)).toBe('unknown')
  })

  it('is out_of_stock at zero or below', () => {
    expect(computeAvailabilityState(0)).toBe('out_of_stock')
    expect(computeAvailabilityState(-1)).toBe('out_of_stock')
  })

  it('is low_stock at or under the threshold', () => {
    expect(computeAvailabilityState(5)).toBe('low_stock')
    expect(computeAvailabilityState(1)).toBe('low_stock')
  })

  it('is in_stock above the threshold', () => {
    expect(computeAvailabilityState(6)).toBe('in_stock')
    expect(computeAvailabilityState(500)).toBe('in_stock')
  })

  it('respects a custom threshold', () => {
    expect(computeAvailabilityState(10, 20)).toBe('low_stock')
    expect(computeAvailabilityState(10, 5)).toBe('in_stock')
  })
})

describe('assessCheckoutAvailability', () => {
  it('allows the full requested quantity when there is no reliable cache data', () => {
    const result = assessCheckoutAvailability(3, null)
    expect(result).toEqual({ ok: true, allowedQuantity: 3 })
  })

  it('rejects when out of stock', () => {
    const result = assessCheckoutAvailability(1, 0)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('out_of_stock')
    expect(result.allowedQuantity).toBe(0)
  })

  it('clamps to the available quantity when requesting more than is available', () => {
    const result = assessCheckoutAvailability(10, 4)
    expect(result).toEqual({ ok: true, allowedQuantity: 4, reason: 'insufficient_stock' })
  })

  it('allows the full requested quantity when enough stock exists', () => {
    const result = assessCheckoutAvailability(2, 10)
    expect(result).toEqual({ ok: true, allowedQuantity: 2 })
  })
})

describe('isInventoryCacheStale', () => {
  const now = new Date('2026-08-19T12:00:00Z')

  it('is stale when never synced', () => {
    expect(isInventoryCacheStale(null, now)).toBe(true)
    expect(isInventoryCacheStale(undefined, now)).toBe(true)
  })

  it('is stale beyond the threshold', () => {
    expect(isInventoryCacheStale('2026-08-18T00:00:00Z', now)).toBe(true)
  })

  it('is fresh within the threshold', () => {
    expect(isInventoryCacheStale('2026-08-19T06:00:00Z', now)).toBe(false)
  })

  it('respects a custom staleness window', () => {
    expect(isInventoryCacheStale('2026-08-19T11:00:00Z', now, 30 * 60 * 1000)).toBe(true)
    expect(isInventoryCacheStale('2026-08-19T11:45:00Z', now, 30 * 60 * 1000)).toBe(false)
  })
})

describe('buildInventoryCacheUpserts', () => {
  it('maps snapshots to variants via the known ledgix_item_id mapping', () => {
    const mapping = new Map([['ITEM-1', 'variant-a']])
    const result = buildInventoryCacheUpserts(
      [{ ledgixItemId: 'ITEM-1', quantityOnHand: 10, quantityAvailable: 8, quantityReserved: 2, syncedAt: '2026-08-19T00:00:00Z' }],
      mapping,
    )
    expect(result).toEqual([
      {
        variantId: 'variant-a',
        ledgixItemId: 'ITEM-1',
        quantityOnHand: 10,
        quantityAvailable: 8,
        quantityReserved: 2,
        lastSyncedAt: '2026-08-19T00:00:00Z',
        syncStatus: 'succeeded',
      },
    ])
  })

  it('drops a snapshot with no known variant mapping', () => {
    const result = buildInventoryCacheUpserts(
      [{ ledgixItemId: 'ITEM-UNMAPPED', quantityOnHand: 1, quantityAvailable: 1, quantityReserved: 0, syncedAt: '2026-08-19T00:00:00Z' }],
      new Map(),
    )
    expect(result).toEqual([])
  })

  it('handles multiple snapshots independently', () => {
    const mapping = new Map([
      ['A', 'v1'],
      ['B', 'v2'],
    ])
    const result = buildInventoryCacheUpserts(
      [
        { ledgixItemId: 'A', quantityOnHand: 5, quantityAvailable: 5, quantityReserved: 0, syncedAt: '2026-08-19T00:00:00Z' },
        { ledgixItemId: 'B', quantityOnHand: 0, quantityAvailable: 0, quantityReserved: 0, syncedAt: '2026-08-19T00:00:00Z' },
      ],
      mapping,
    )
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.variantId)).toEqual(['v1', 'v2'])
  })
})
