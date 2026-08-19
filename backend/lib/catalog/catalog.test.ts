import { describe, expect, it } from 'vitest'
import { assessPublishReadiness, computeDefaultBadge, computeDiscountPercent, isWithinCampaignWindow } from './index.ts'

describe('computeDiscountPercent', () => {
  it('returns 0 when there is no compare-at price', () => {
    expect(computeDiscountPercent(12900, null)).toBe(0)
  })

  it('returns 0 when compare-at is not actually higher', () => {
    expect(computeDiscountPercent(12900, 10000)).toBe(0)
  })

  it('rounds the percentage off', () => {
    expect(computeDiscountPercent(12900, 19900)).toBe(35)
  })
})

describe('isWithinCampaignWindow', () => {
  const now = new Date('2026-08-19T12:00:00Z')

  it('is true with no bounds', () => {
    expect(isWithinCampaignWindow(now, null, null)).toBe(true)
  })

  it('is false before startsAt', () => {
    expect(isWithinCampaignWindow(now, '2026-09-01T00:00:00Z', null)).toBe(false)
  })

  it('is false after endsAt', () => {
    expect(isWithinCampaignWindow(now, null, '2026-08-01T00:00:00Z')).toBe(false)
  })

  it('is true inside the window', () => {
    expect(isWithinCampaignWindow(now, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(true)
  })
})

describe('assessPublishReadiness', () => {
  it('is ready when there is a published variant and an image', () => {
    const result = assessPublishReadiness({ variantCount: 1, publishedVariantCount: 1, imageCount: 2 })
    expect(result.ready).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('is not ready with zero variants', () => {
    const result = assessPublishReadiness({ variantCount: 0, publishedVariantCount: 0, imageCount: 1 })
    expect(result.ready).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/no variants/i)
  })

  it('is not ready when every variant is draft/archived', () => {
    const result = assessPublishReadiness({ variantCount: 2, publishedVariantCount: 0, imageCount: 1 })
    expect(result.ready).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/no published/i)
  })

  it('is not ready with zero images', () => {
    const result = assessPublishReadiness({ variantCount: 1, publishedVariantCount: 1, imageCount: 0 })
    expect(result.ready).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/no images/i)
  })
})

describe('computeDefaultBadge', () => {
  const now = new Date('2026-08-19T00:00:00Z')

  it('prefers sale when discounted', () => {
    expect(
      computeDefaultBadge({ price: 100, compareAtPrice: 200, isFeatured: true, publishedAt: null, now }),
    ).toBe('sale')
  })

  it('is new when published within the last 14 days', () => {
    expect(
      computeDefaultBadge({
        price: 100,
        compareAtPrice: null,
        isFeatured: false,
        publishedAt: '2026-08-10T00:00:00Z',
        now,
      }),
    ).toBe('new')
  })

  it('is bestseller when featured and not newly published', () => {
    expect(
      computeDefaultBadge({
        price: 100,
        compareAtPrice: null,
        isFeatured: true,
        publishedAt: '2025-01-01T00:00:00Z',
        now,
      }),
    ).toBe('bestseller')
  })

  it('is null otherwise', () => {
    expect(
      computeDefaultBadge({ price: 100, compareAtPrice: null, isFeatured: false, publishedAt: null, now }),
    ).toBeNull()
  })
})
