import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { NotFoundError, ValidationError } from '../../lib/errors/index.ts'
import type { AuditLogWriter } from '../../lib/audit/index.ts'
import { FakeSupabaseClient } from './testUtils.ts'
import {
  attachReviewImage,
  createReview,
  createReviewImageUploadUrl,
  listMyReviews,
  listReviewableOrderItems,
  listReviewsForModeration,
  moderateReview,
} from './reviews.service.ts'

const PROFILE_ID = 'profile-1'
const CUSTOMER_ID = 'customer-1'
const ORDER_ID = 'order-1'
const ORDER_ITEM_ID = 'order-item-1'
const PRODUCT_ID = 'product-1'

function seedBase(db: FakeSupabaseClient, orderStatus = 'delivered') {
  db.seed('customers', [{ id: CUSTOMER_ID, profile_id: PROFILE_ID }])
  db.seed('orders', [{ id: ORDER_ID, customer_id: CUSTOMER_ID, order_status: orderStatus, order_number: 'AURA-20260819-ABC123' }])
  db.seed('order_items', [{ id: ORDER_ITEM_ID, order_id: ORDER_ID, product_id: PRODUCT_ID, product_name: 'Collagen Mask' }])
}

function client(db: FakeSupabaseClient) {
  return db as unknown as SupabaseClient
}

describe('listReviewableOrderItems', () => {
  it('lists delivered, not-yet-reviewed order items for the caller', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    const items = await listReviewableOrderItems(client(db), PROFILE_ID)
    expect(items).toEqual([
      { orderItemId: ORDER_ITEM_ID, productId: PRODUCT_ID, productName: 'Collagen Mask', orderId: ORDER_ID, orderNumber: 'AURA-20260819-ABC123' },
    ])
  })

  it('excludes an item that already has a review', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    db.seed('product_reviews', [{ id: 'rev-1', order_item_id: ORDER_ITEM_ID, product_id: PRODUCT_ID, customer_id: CUSTOMER_ID, rating: 5, status: 'published' }])
    const items = await listReviewableOrderItems(client(db), PROFILE_ID)
    expect(items).toEqual([])
  })

  it('excludes items from an undelivered order', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db, 'shipped')
    expect(await listReviewableOrderItems(client(db), PROFILE_ID)).toEqual([])
  })

  it('returns empty for a caller with no customer record', async () => {
    const db = new FakeSupabaseClient()
    expect(await listReviewableOrderItems(client(db), 'no-such-profile')).toEqual([])
  })
})

describe('createReview', () => {
  it('creates a pending review for a delivered, unreviewed purchase', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    const review = await createReview(client(db), PROFILE_ID, { orderItemId: ORDER_ITEM_ID, rating: 5, title: 'Great', body: 'Loved it.' })
    expect(review.status).toBe('pending')
    expect(review.productId).toBe(PRODUCT_ID)
    expect(review.rating).toBe(5)
  })

  it('rejects a review for an undelivered order', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db, 'shipped')
    await expect(createReview(client(db), PROFILE_ID, { orderItemId: ORDER_ITEM_ID, rating: 5 })).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects a duplicate review for the same order item', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    db.seed('product_reviews', [{ id: 'rev-1', order_item_id: ORDER_ITEM_ID, product_id: PRODUCT_ID, customer_id: CUSTOMER_ID, rating: 4, status: 'pending' }])
    await expect(createReview(client(db), PROFILE_ID, { orderItemId: ORDER_ITEM_ID, rating: 5 })).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects an order item that does not belong to the caller', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    db.seed('customers', [{ id: CUSTOMER_ID, profile_id: PROFILE_ID }, { id: 'other-customer', profile_id: 'other-profile' }])
    db.seed('orders', [{ id: ORDER_ID, customer_id: 'other-customer', order_status: 'delivered', order_number: 'AURA-1' }])
    await expect(createReview(client(db), PROFILE_ID, { orderItemId: ORDER_ITEM_ID, rating: 5 })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('listMyReviews', () => {
  it("returns the caller's own reviews with attached images", async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    db.seed('product_reviews', [{ id: 'rev-1', order_item_id: ORDER_ITEM_ID, product_id: PRODUCT_ID, customer_id: CUSTOMER_ID, rating: 4, status: 'pending', created_at: '2026-08-19T00:00:00Z' }])
    db.seed('product_review_images', [{ id: 'img-1', review_id: 'rev-1', storage_path: 'rev-1/img-1.jpg' }])
    const reviews = await listMyReviews(client(db), PROFILE_ID)
    expect(reviews).toHaveLength(1)
    expect(reviews[0]!.images).toEqual([{ id: 'img-1', storagePath: 'rev-1/img-1.jpg' }])
  })
})

describe('review image upload', () => {
  it('issues a signed upload URL for a pending review the caller owns', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    db.seed('product_reviews', [{ id: 'rev-1', order_item_id: ORDER_ITEM_ID, product_id: PRODUCT_ID, customer_id: CUSTOMER_ID, rating: 4, status: 'pending' }])
    const result = await createReviewImageUploadUrl(client(db), PROFILE_ID, 'rev-1', { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 })
    expect(result.path).toMatch(/^rev-1\//)
  })

  it('refuses to upload an image to a moderated review', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    db.seed('product_reviews', [{ id: 'rev-1', order_item_id: ORDER_ITEM_ID, product_id: PRODUCT_ID, customer_id: CUSTOMER_ID, rating: 4, status: 'published' }])
    await expect(
      createReviewImageUploadUrl(client(db), PROFILE_ID, 'rev-1', { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses an image for a review the caller does not own', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    db.seed('product_reviews', [{ id: 'rev-1', order_item_id: ORDER_ITEM_ID, product_id: PRODUCT_ID, customer_id: 'someone-else', rating: 4, status: 'pending' }])
    await expect(
      createReviewImageUploadUrl(client(db), PROFILE_ID, 'rev-1', { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('caps images per review', async () => {
    const db = new FakeSupabaseClient()
    seedBase(db)
    db.seed('product_reviews', [{ id: 'rev-1', order_item_id: ORDER_ITEM_ID, product_id: PRODUCT_ID, customer_id: CUSTOMER_ID, rating: 4, status: 'pending' }])
    db.seed(
      'product_review_images',
      Array.from({ length: 5 }, (_, i) => ({ id: `img-${i}`, review_id: 'rev-1', storage_path: `rev-1/img-${i}.jpg` })),
    )
    await expect(attachReviewImage(client(db), PROFILE_ID, 'rev-1', 'rev-1/img-new.jpg')).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('moderation', () => {
  it('lists reviews filtered by status', async () => {
    const db = new FakeSupabaseClient()
    db.seed('product_reviews', [
      { id: 'rev-1', order_item_id: 'oi-1', product_id: PRODUCT_ID, customer_id: CUSTOMER_ID, rating: 5, status: 'pending', created_at: '2026-08-19T00:00:00Z' },
      { id: 'rev-2', order_item_id: 'oi-2', product_id: PRODUCT_ID, customer_id: CUSTOMER_ID, rating: 4, status: 'published', created_at: '2026-08-19T00:00:00Z' },
    ])
    const pending = await listReviewsForModeration(client(db), { status: 'pending' })
    expect(pending.map((r) => r.id)).toEqual(['rev-1'])
  })

  it('publishes a review and stamps the moderator/timestamp, and audits the action', async () => {
    const db = new FakeSupabaseClient()
    db.seed('product_reviews', [{ id: 'rev-1', order_item_id: 'oi-1', product_id: PRODUCT_ID, customer_id: CUSTOMER_ID, rating: 5, status: 'pending' }])
    const updated = await moderateReview(client(db) as SupabaseClient & AuditLogWriter, 'rev-1', { status: 'published' }, {
      profileId: 'admin-1',
      authUserId: 'auth-1',
    })
    expect(updated.status).toBe('published')
    expect(db.getTable('audit_logs')).toHaveLength(1)
    expect(db.getTable('audit_logs')[0]!.action).toBe('review.moderated')
  })

  it('throws NotFoundError for a nonexistent review', async () => {
    const db = new FakeSupabaseClient()
    await expect(
      moderateReview(client(db) as SupabaseClient & AuditLogWriter, 'no-such-id', { status: 'rejected' }, {
        profileId: 'admin-1',
        authUserId: 'auth-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
