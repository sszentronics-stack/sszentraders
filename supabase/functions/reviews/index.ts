/**
 * reviews — Phase 14 (Reviews, Returns & Customer Service). New Edge
 * Function (Phase 1 deferred reviews entirely — see
 * backend/services/reviews/README.md). Handles every privileged review
 * write path; PUBLIC reads of published reviews go straight through RLS
 * (product_reviews_public_read, 0024_reviews_and_returns_workflow.sql) via
 * src/repositories/reviews.repository.ts's anon-key client and never touch
 * this function.
 *
 *   GET    /reviewable-order-items    delivered, not-yet-reviewed purchases (caller)
 *   POST   /                           create a review (verified-purchase eligibility re-checked server-side)
 *   GET    /                           list the caller's own reviews (any status)
 *   POST   /:id/upload-url             signed upload URL for a review image (caller-owned, still pending)
 *   POST   /:id/images                 record an uploaded review image
 *
 *   GET    /admin?status=              admin: list reviews for moderation
 *   POST   /:id/moderate               admin: publish or reject a review
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireCallerProfile } from '../_shared/callerAuth.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { NotFoundError, ValidationError } from '../../../backend/lib/errors/index.ts'
import {
  attachReviewImageSchema,
  createReviewSchema,
  moderateReviewSchema,
  parseOrThrow,
  reviewImageUploadRequestSchema,
} from '../../../backend/lib/validation/index.ts'
import * as reviews from '../../../backend/services/reviews/reviews.service.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?reviews\/?/, '').split('/').filter(Boolean)
    const admin = getSupabaseAdminClient()
    const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}))

    // GET /reviewable-order-items
    if (segments.length === 1 && segments[0] === 'reviewable-order-items' && req.method === 'GET') {
      const caller = await requireCallerProfile(req)
      return okResponse(await reviews.listReviewableOrderItems(admin, caller.id))
    }

    // GET /admin?status=
    if (segments.length === 1 && segments[0] === 'admin' && req.method === 'GET') {
      await requireAdmin(req)
      const status = url.searchParams.get('status')
      if (status && !['pending', 'published', 'rejected'].includes(status)) {
        throw new ValidationError(`Unrecognized review status "${status}".`)
      }
      const limitParam = url.searchParams.get('limit')
      return okResponse(
        await reviews.listReviewsForModeration(admin, {
          status: (status as 'pending' | 'published' | 'rejected' | null) ?? undefined,
          limit: limitParam ? Number(limitParam) : undefined,
        }),
      )
    }

    const caller = await requireCallerProfile(req)

    // POST / — create a review
    if (segments.length === 0 && req.method === 'POST') {
      const input = parseOrThrow(createReviewSchema, body)
      const created = await reviews.createReview(admin, caller.id, input)
      return okResponse(created, 201)
    }

    // GET / — list my reviews
    if (segments.length === 0 && req.method === 'GET') {
      return okResponse({ reviews: await reviews.listMyReviews(admin, caller.id) })
    }

    const [reviewId, ...rest] = segments
    if (!reviewId) throw new NotFoundError('route', 'No matching route for this method/path on the reviews function.')

    // POST /:id/upload-url
    if (rest.length === 1 && rest[0] === 'upload-url' && req.method === 'POST') {
      const input = parseOrThrow(reviewImageUploadRequestSchema, body)
      const result = await reviews.createReviewImageUploadUrl(admin, caller.id, reviewId, input)
      return okResponse(result, 201)
    }

    // POST /:id/images
    if (rest.length === 1 && rest[0] === 'images' && req.method === 'POST') {
      const input = parseOrThrow(attachReviewImageSchema, body)
      const result = await reviews.attachReviewImage(admin, caller.id, reviewId, input.storagePath)
      return okResponse(result, 201)
    }

    // POST /:id/moderate — admin only
    if (rest.length === 1 && rest[0] === 'moderate' && req.method === 'POST') {
      const adminCaller = await requireAdmin(req)
      const input = parseOrThrow(moderateReviewSchema, body)
      return okResponse(await reviews.moderateReview(admin, reviewId, input, adminCaller))
    }

    throw new ValidationError('No matching route for this method/path on the reviews function.')
  }),
)
