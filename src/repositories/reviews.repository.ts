/**
 * Reviews data access — Phase 14. Published reviews are read directly via
 * the anon-key browser client (RLS's `product_reviews_public_read` policy,
 * 0024_reviews_and_returns_workflow.sql, already restricts this to
 * `status = 'published'` regardless of what's requested here — same
 * "public RLS-safe read via a repository" pattern products.repository.ts
 * already establishes). Every write/self-read path goes through the
 * `reviews` Edge Function (backend/services/reviews/reviews.service.ts),
 * which re-verifies eligibility server-side.
 */
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import { callEdgeFunction } from '../lib/supabase/functions'
import { computeAggregateRating } from '../../backend/lib/reviews/index'

export interface ReviewImage {
  id: string
  storagePath: string
}

export interface ProductReview {
  id: string
  productId: string
  rating: number
  title: string | null
  body: string | null
  status: 'pending' | 'published' | 'rejected'
  moderationNote: string | null
  createdAt: string
  images: ReviewImage[]
}

interface PublishedReviewRow {
  id: string
  product_id: string
  rating: number
  title: string | null
  body: string | null
  created_at: string
  product_review_images: { id: string; storage_path: string }[]
}

function reviewImagePublicUrl(storagePath: string): string {
  const { data } = getSupabaseBrowserClient().storage.from('review-images').getPublicUrl(storagePath)
  return data.publicUrl
}

/** Published reviews for a product, newest first — anon-key read, RLS-scoped to status='published'. */
export async function listPublishedReviews(productId: string): Promise<ProductReview[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('product_reviews')
    .select('id, product_id, rating, title, body, created_at, product_review_images(id, storage_path)')
    .eq('product_id', productId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  return ((data ?? []) as PublishedReviewRow[]).map((row) => ({
    id: row.id,
    productId: row.product_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: 'published',
    moderationNote: null,
    createdAt: row.created_at,
    images: (row.product_review_images ?? []).map((img) => ({ id: img.id, storagePath: img.storage_path })),
  }))
}

export { reviewImagePublicUrl, computeAggregateRating }

export interface ReviewableOrderItem {
  orderItemId: string
  productId: string
  productName: string
  orderId: string
  orderNumber: string
}

export function listReviewableOrderItems(): Promise<ReviewableOrderItem[]> {
  return callEdgeFunction<ReviewableOrderItem[]>('reviews/reviewable-order-items', { method: 'GET' })
}

export interface CreateReviewInput {
  orderItemId: string
  rating: number
  title?: string
  body?: string
}

export function createReview(input: CreateReviewInput): Promise<ProductReview> {
  return callEdgeFunction<ProductReview>('reviews', { method: 'POST', body: input })
}

export async function listMyReviews(): Promise<ProductReview[]> {
  const { reviews } = await callEdgeFunction<{ reviews: ProductReview[] }>('reviews', { method: 'GET' })
  return reviews
}

/** Requests a signed upload URL, uploads the file directly to Storage, then attaches the resulting path to the review. */
export async function uploadReviewImage(reviewId: string, file: File): Promise<ReviewImage> {
  const { path, token } = await callEdgeFunction<{ path: string; signedUrl: string; token: string }>(
    `reviews/${reviewId}/upload-url`,
    { method: 'POST', body: { fileName: file.name, mimeType: file.type, sizeBytes: file.size } },
  )

  const { error } = await getSupabaseBrowserClient().storage.from('review-images').uploadToSignedUrl(path, token, file)
  if (error) throw new Error(error.message)

  return callEdgeFunction<ReviewImage>(`reviews/${reviewId}/images`, { method: 'POST', body: { storagePath: path } })
}
