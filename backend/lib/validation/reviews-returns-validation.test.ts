import { describe, expect, it } from 'vitest'
import {
  createReturnRequestSchema,
  createReviewSchema,
  moderateReviewSchema,
  parseOrThrow,
  recordInspectionOutcomeSchema,
  returnEvidenceUploadRequestSchema,
} from './index'

const ORDER_ITEM_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'

describe('createReviewSchema', () => {
  it('accepts a valid review', () => {
    const input = parseOrThrow(createReviewSchema, { orderItemId: ORDER_ITEM_ID, rating: 5, title: 'Love it', body: 'Great product.' })
    expect(input.rating).toBe(5)
  })

  it('rejects a rating outside 1-5', () => {
    expect(() => parseOrThrow(createReviewSchema, { orderItemId: ORDER_ITEM_ID, rating: 6 })).toThrow()
    expect(() => parseOrThrow(createReviewSchema, { orderItemId: ORDER_ITEM_ID, rating: 0 })).toThrow()
  })
})

describe('moderateReviewSchema', () => {
  it('accepts published/rejected only', () => {
    expect(parseOrThrow(moderateReviewSchema, { status: 'published' }).status).toBe('published')
    expect(() => parseOrThrow(moderateReviewSchema, { status: 'pending' })).toThrow()
  })
})

describe('returnEvidenceUploadRequestSchema', () => {
  it('accepts a valid upload request', () => {
    const input = parseOrThrow(returnEvidenceUploadRequestSchema, {
      orderItemId: ORDER_ITEM_ID,
      fileName: 'damaged.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    })
    expect(input.fileName).toBe('damaged.jpg')
  })
})

describe('createReturnRequestSchema', () => {
  it('accepts a valid single-line request', () => {
    const input = parseOrThrow(createReturnRequestSchema, {
      orderId: ORDER_ID,
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'changed_mind' }],
    })
    expect(input.items).toHaveLength(1)
    expect(input.items[0]!.evidenceStoragePaths).toEqual([])
  })

  it('rejects an unrecognized reason code', () => {
    expect(() =>
      parseOrThrow(createReturnRequestSchema, {
        orderId: ORDER_ID,
        items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'not_a_real_reason' }],
      }),
    ).toThrow()
  })

  it('rejects an empty items array', () => {
    expect(() => parseOrThrow(createReturnRequestSchema, { orderId: ORDER_ID, items: [] })).toThrow()
  })
})

describe('recordInspectionOutcomeSchema', () => {
  it('accepts a replacement with no refundAmount', () => {
    const input = parseOrThrow(recordInspectionOutcomeSchema, { resolution: 'replacement' })
    expect(input.resolution).toBe('replacement')
  })

  it('requires refundAmount when resolution is refund', () => {
    expect(() => parseOrThrow(recordInspectionOutcomeSchema, { resolution: 'refund' })).toThrow()
  })

  it('accepts a refund with a refundAmount', () => {
    const input = parseOrThrow(recordInspectionOutcomeSchema, { resolution: 'refund', refundAmount: 5000 })
    expect(input.refundAmount).toBe(5000)
  })
})
