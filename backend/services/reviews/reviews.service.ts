/**
 * Verified-purchase product reviews — Phase 14 (Reviews, Returns & Customer
 * Service). Every write path here re-verifies eligibility server-side
 * (delivered order, owned by the caller, not already reviewed) using
 * backend/lib/reviews' evaluateReviewEligibility() — the frontend never
 * asserts eligibility, it only reflects what this service already decided.
 * Public reads of PUBLISHED reviews go straight through RLS
 * (product_reviews_public_read, 0024_reviews_and_returns_workflow.sql) via
 * src/repositories/reviews.repository.ts's anon-key client — this service
 * only handles the privileged paths: create, self-list, image upload,
 * moderation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateReviewEligibility } from '../../lib/reviews/index.ts'
import { validateImageUpload, buildReviewImageStoragePath, type ImageUploadCandidate } from '../../lib/media/index.ts'
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors/index.ts'
import type { CreateReviewInput, ModerateReviewInput } from '../../lib/validation/index.ts'
import { writeAuditLog, type AuditLogWriter } from '../../lib/audit/index.ts'

const REVIEW_IMAGES_BUCKET = 'review-images'

const REVIEW_COLUMNS =
  'id, product_id, customer_id, order_item_id, rating, title, body, status, moderation_note, moderated_by, moderated_at, created_at, updated_at'

interface ReviewRow {
  id: string
  product_id: string
  customer_id: string
  order_item_id: string
  rating: number
  title: string | null
  body: string | null
  status: 'pending' | 'published' | 'rejected'
  moderation_note: string | null
  moderated_by: string | null
  moderated_at: string | null
  created_at: string
  updated_at: string
}

export interface ReviewImageRecord {
  id: string
  storagePath: string
}

export interface ReviewRecord {
  id: string
  productId: string
  customerId: string
  orderItemId: string
  rating: number
  title: string | null
  body: string | null
  status: ReviewRow['status']
  moderationNote: string | null
  moderatedAt: string | null
  createdAt: string
  updatedAt: string
  images: ReviewImageRecord[]
}

async function attachImages(db: SupabaseClient, reviews: ReviewRow[]): Promise<Map<string, ReviewImageRecord[]>> {
  if (reviews.length === 0) return new Map()
  const { data, error } = await db
    .from('product_review_images')
    .select('id, review_id, storage_path')
    .in(
      'review_id',
      reviews.map((r) => r.id),
    )
  if (error) throw error
  const byReview = new Map<string, ReviewImageRecord[]>()
  for (const row of (data ?? []) as { id: string; review_id: string; storage_path: string }[]) {
    const list = byReview.get(row.review_id) ?? []
    list.push({ id: row.id, storagePath: row.storage_path })
    byReview.set(row.review_id, list)
  }
  return byReview
}

function mapReview(row: ReviewRow, images: ReviewImageRecord[] = []): ReviewRecord {
  return {
    id: row.id,
    productId: row.product_id,
    customerId: row.customer_id,
    orderItemId: row.order_item_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status,
    moderationNote: row.moderation_note,
    moderatedAt: row.moderated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images,
  }
}

async function getCustomerId(db: SupabaseClient, profileId: string): Promise<string | null> {
  const { data } = await db.from('customers').select('id').eq('profile_id', profileId).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

interface OrderItemForReviewRow {
  id: string
  product_id: string | null
  order_id: string
}

interface OrderForReviewRow {
  id: string
  customer_id: string | null
  order_status: string
}

/**
 * Order items belonging to the caller whose order is delivered and that do
 * not have a review yet — the "you can review this" prompt list for My
 * Orders / product pages. Returns the shape the frontend needs to route to
 * the review form (orderItemId, productId) without exposing anything else.
 */
export async function listReviewableOrderItems(
  db: SupabaseClient,
  profileId: string,
): Promise<Array<{ orderItemId: string; productId: string; productName: string; orderId: string; orderNumber: string }>> {
  const customerId = await getCustomerId(db, profileId)
  if (!customerId) return []

  const { data: orders, error: ordersError } = await db
    .from('orders')
    .select('id, order_number')
    .eq('customer_id', customerId)
    .eq('order_status', 'delivered')
  if (ordersError) throw ordersError
  const orderRows = (orders ?? []) as { id: string; order_number: string }[]
  if (orderRows.length === 0) return []
  const orderNumberById = new Map(orderRows.map((o) => [o.id, o.order_number]))

  const { data: items, error: itemsError } = await db
    .from('order_items')
    .select('id, product_id, product_name, order_id')
    .in(
      'order_id',
      orderRows.map((o) => o.id),
    )
  if (itemsError) throw itemsError
  const itemRows = (items ?? []) as { id: string; product_id: string | null; product_name: string; order_id: string }[]
  if (itemRows.length === 0) return []

  const { data: existingReviews, error: reviewsError } = await db
    .from('product_reviews')
    .select('order_item_id')
    .in(
      'order_item_id',
      itemRows.map((i) => i.id),
    )
  if (reviewsError) throw reviewsError
  const reviewed = new Set(((existingReviews ?? []) as { order_item_id: string }[]).map((r) => r.order_item_id))

  return itemRows
    .filter((item) => item.product_id && !reviewed.has(item.id))
    .map((item) => ({
      orderItemId: item.id,
      productId: item.product_id as string,
      productName: item.product_name,
      orderId: item.order_id,
      orderNumber: orderNumberById.get(item.order_id) ?? '',
    }))
}

/**
 * Create a review for a purchased order item. Re-verifies eligibility
 * end-to-end server-side: the order item must belong to the caller, its
 * order must be delivered, and no review may already exist for it — the
 * database's own UNIQUE(order_item_id) constraint is the final backstop
 * against a race between two concurrent submissions.
 */
export async function createReview(db: SupabaseClient, profileId: string, input: CreateReviewInput): Promise<ReviewRecord> {
  const customerId = await getCustomerId(db, profileId)
  if (!customerId) throw new NotFoundError('Order item')

  const { data: itemRow, error: itemError } = await db
    .from('order_items')
    .select('id, product_id, order_id')
    .eq('id', input.orderItemId)
    .maybeSingle()
  if (itemError) throw itemError
  const item = itemRow as OrderItemForReviewRow | null
  if (!item || !item.product_id) throw new NotFoundError('Order item')

  const { data: orderRow, error: orderError } = await db
    .from('orders')
    .select('id, customer_id, order_status')
    .eq('id', item.order_id)
    .maybeSingle()
  if (orderError) throw orderError
  const order = orderRow as OrderForReviewRow | null
  // Never distinguish "not yours" from "doesn't exist" — same rule
  // getOrderForCaller() (orders.service.ts) already follows.
  if (!order || order.customer_id !== customerId) throw new NotFoundError('Order item')

  const { data: existing, error: existingError } = await db
    .from('product_reviews')
    .select('id')
    .eq('order_item_id', input.orderItemId)
    .maybeSingle()
  if (existingError) throw existingError

  const eligibility = evaluateReviewEligibility({ orderStatus: order.order_status, alreadyReviewed: Boolean(existing) })
  if (!eligibility.eligible) {
    throw new ValidationError(eligibility.reasons.join(' '), eligibility.reasons.map((message) => ({ path: 'orderItemId', message })))
  }

  const { data: inserted, error: insertError } = await db
    .from('product_reviews')
    .insert({
      product_id: item.product_id,
      customer_id: customerId,
      order_item_id: input.orderItemId,
      rating: input.rating,
      title: input.title ?? null,
      body: input.body ?? null,
      status: 'pending',
    })
    .select(REVIEW_COLUMNS)
    .single()
  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') {
      throw new ConflictError('You have already reviewed this purchase.')
    }
    throw insertError
  }

  return mapReview(inserted as ReviewRow)
}

export async function listMyReviews(db: SupabaseClient, profileId: string): Promise<ReviewRecord[]> {
  const customerId = await getCustomerId(db, profileId)
  if (!customerId) return []

  const { data, error } = await db
    .from('product_reviews')
    .select(REVIEW_COLUMNS)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as ReviewRow[]
  const imagesByReview = await attachImages(db, rows)
  return rows.map((row) => mapReview(row, imagesByReview.get(row.id) ?? []))
}

async function assertOwnsReview(db: SupabaseClient, profileId: string, reviewId: string): Promise<ReviewRow> {
  const customerId = await getCustomerId(db, profileId)
  const { data, error } = await db.from('product_reviews').select(REVIEW_COLUMNS).eq('id', reviewId).maybeSingle()
  if (error) throw error
  const review = data as ReviewRow | null
  if (!review || !customerId || review.customer_id !== customerId) throw new NotFoundError('Review')
  return review
}

/** Signed upload URL for a review image — only while the review is still `pending` (can't attach new "evidence" to an already-moderated review). */
export async function createReviewImageUploadUrl(
  db: SupabaseClient,
  profileId: string,
  reviewId: string,
  candidate: ImageUploadCandidate,
): Promise<{ path: string; signedUrl: string; token: string }> {
  const review = await assertOwnsReview(db, profileId, reviewId)
  if (review.status !== 'pending') {
    throw new ValidationError('Images can only be added to a review awaiting moderation.')
  }

  const mimeType = validateImageUpload(candidate)
  const imageId = crypto.randomUUID()
  const path = buildReviewImageStoragePath({ reviewId, imageId, mimeType })

  const { data, error } = await db.storage.from(REVIEW_IMAGES_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw error ?? new Error('Failed to create signed upload URL.')
  return { path: data.path, signedUrl: data.signedUrl, token: data.token }
}

const MAX_IMAGES_PER_REVIEW = 5

export async function attachReviewImage(
  db: SupabaseClient,
  profileId: string,
  reviewId: string,
  storagePath: string,
): Promise<ReviewImageRecord> {
  const review = await assertOwnsReview(db, profileId, reviewId)
  if (review.status !== 'pending') {
    throw new ValidationError('Images can only be added to a review awaiting moderation.')
  }

  const { count, error: countError } = await db
    .from('product_review_images')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', reviewId)
  if (countError) throw countError
  if ((count ?? 0) >= MAX_IMAGES_PER_REVIEW) {
    throw new ValidationError(`A review can have at most ${MAX_IMAGES_PER_REVIEW} images.`)
  }

  const { data, error } = await db
    .from('product_review_images')
    .insert({ review_id: reviewId, storage_path: storagePath })
    .select('id, storage_path')
    .single()
  if (error) throw error
  return { id: data.id as string, storagePath: data.storage_path as string }
}

// ---------------------------------------------------------------------------
// Admin moderation — no admin UI here (Phase 12's job), service-layer only.
// ---------------------------------------------------------------------------

export interface ReviewModerationFilters {
  status?: 'pending' | 'published' | 'rejected'
  limit?: number
}

export async function listReviewsForModeration(db: SupabaseClient, filters: ReviewModerationFilters = {}): Promise<ReviewRecord[]> {
  let query = db.from('product_reviews').select(REVIEW_COLUMNS).order('created_at', { ascending: true }).limit(filters.limit ?? 100)
  if (filters.status) query = query.eq('status', filters.status)
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as ReviewRow[]
  const imagesByReview = await attachImages(db, rows)
  return rows.map((row) => mapReview(row, imagesByReview.get(row.id) ?? []))
}

export interface AdminActor {
  profileId: string
  authUserId: string
}

/** Publish or reject a review, recorded with who/when and an audit trail — every moderation action is security-sensitive per the phase spec. */
export async function moderateReview(
  db: SupabaseClient & AuditLogWriter,
  reviewId: string,
  input: ModerateReviewInput,
  actor: AdminActor,
): Promise<ReviewRecord> {
  const { data: existing, error: existingError } = await db.from('product_reviews').select(REVIEW_COLUMNS).eq('id', reviewId).maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new NotFoundError('Review')

  const { data: updated, error } = await db
    .from('product_reviews')
    .update({
      status: input.status,
      moderation_note: input.moderationNote ?? null,
      moderated_by: actor.profileId,
      moderated_at: new Date().toISOString(),
    })
    .eq('id', reviewId)
    .select(REVIEW_COLUMNS)
    .single()
  if (error) throw error

  await writeAuditLog(db, {
    actor: actor.profileId,
    actorType: 'admin',
    action: 'review.moderated',
    entityType: 'product_review',
    entityId: reviewId,
    metadata: { status: input.status },
  })

  return mapReview(updated as ReviewRow)
}
