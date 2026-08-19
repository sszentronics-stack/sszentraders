import { describe, expect, it } from 'vitest'
import { computeAggregateRating, evaluateReviewEligibility } from './index'

describe('evaluateReviewEligibility', () => {
  it('is eligible for a delivered, not-yet-reviewed purchase', () => {
    const result = evaluateReviewEligibility({ orderStatus: 'delivered', alreadyReviewed: false })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('rejects an undelivered order', () => {
    const result = evaluateReviewEligibility({ orderStatus: 'shipped', alreadyReviewed: false })
    expect(result.eligible).toBe(false)
    expect(result.reasons[0]).toMatch(/delivered/)
  })

  it('rejects a duplicate review', () => {
    const result = evaluateReviewEligibility({ orderStatus: 'delivered', alreadyReviewed: true })
    expect(result.eligible).toBe(false)
    expect(result.reasons[0]).toMatch(/already reviewed/)
  })

  it('reports both reasons when neither condition is met', () => {
    const result = evaluateReviewEligibility({ orderStatus: 'shipped', alreadyReviewed: true })
    expect(result.eligible).toBe(false)
    expect(result.reasons).toHaveLength(2)
  })
})

describe('computeAggregateRating', () => {
  it('returns zero/zero for no reviews', () => {
    expect(computeAggregateRating([])).toEqual({ average: 0, count: 0 })
  })

  it('averages and rounds to one decimal place', () => {
    expect(computeAggregateRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ average: 4.3, count: 3 })
  })

  it('handles a single review', () => {
    expect(computeAggregateRating([{ rating: 3 }])).toEqual({ average: 3, count: 1 })
  })
})
