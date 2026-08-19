/**
 * returns — Phase 14 (Reviews, Returns & Customer Service). Replaces the
 * Phase 1 NotImplementedYetError stub with the real return-request +
 * admin-review/approve/reject + courier-handoff + inspection-outcome +
 * refund router, on top of the existing `returns`/`return_items`/
 * `return_events` schema (0009_returns.sql, extended by
 * 0021_reviews_and_returns_workflow.sql).
 *
 *   GET    /                              list the caller's own returns
 *   GET    /:id                           read one return (caller-owned, or admin) — includes items + event timeline
 *   GET    /order/:orderId/eligible-items which order items (and how much of each) can still be returned
 *   POST   /evidence/upload-url           signed upload URL for return-evidence photos
 *   POST   /                              create a return request (server-side eligibility engine)
 *
 *   GET    /admin?status=                 admin: list returns, optionally filtered by status
 *   POST   /:id/review                    admin: requested -> under_review
 *   POST   /:id/approve                   admin: under_review -> approved, attempts Leopards pickup booking
 *   POST   /:id/reject                    admin: requested/under_review -> rejected
 *   POST   /:id/received                  admin: mark the item physically received (manual/drop-off, or post-pickup)
 *   POST   /:id/inspection                admin: record refund/replacement outcome; refund triggers the full financial flow
 *   POST   /:id/close                     admin: close out a resolved/rejected return
 *
 * Every admin route requires requireAdmin() and is audited (see
 * backend/services/reviews/returns.service.ts / refund.service.ts, which
 * write the actual audit log entries). Courier/payment/ERP provider calls
 * all still throw IntegrationNotConfiguredError until real credentials
 * exist — this router never fabricates a booking, refund, or ERP reference.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireCallerProfile } from '../_shared/callerAuth.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { getEasypaisaConfig, getLedGixConfig, getLeopardsConfig } from '../_shared/config.ts'
import { EasypaisaProvider } from '../../../backend/lib/providers/easypaisa/EasypaisaProvider.ts'
import { LeopardsCourierProvider } from '../../../backend/lib/providers/leopards/LeopardsCourierProvider.ts'
import { LedGixErpProvider } from '../../../backend/lib/providers/ledgix/LedGixErpProvider.ts'
import { NotFoundError, ValidationError } from '../../../backend/lib/errors/index.ts'
import { isReturnStatus } from '../../../backend/lib/status/index.ts'
import {
  createReturnRequestSchema,
  parseOrThrow,
  recordInspectionOutcomeSchema,
  returnDecisionSchema,
  returnEvidenceUploadRequestSchema,
  returnReviewSchema,
} from '../../../backend/lib/validation/index.ts'
import * as returns from '../../../backend/services/reviews/returns.service.ts'
import { processReturnRefund } from '../../../backend/services/reviews/refund.service.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?returns\/?/, '').split('/').filter(Boolean)
    const admin = getSupabaseAdminClient()
    const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}))

    // POST /evidence/upload-url
    if (segments.length === 2 && segments[0] === 'evidence' && segments[1] === 'upload-url' && req.method === 'POST') {
      const caller = await requireCallerProfile(req)
      const input = parseOrThrow(returnEvidenceUploadRequestSchema, body)
      const result = await returns.createReturnEvidenceUploadUrl(admin, caller.id, input.orderItemId, {
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      })
      return okResponse(result, 201)
    }

    // GET /order/:orderId/eligible-items
    if (segments.length === 3 && segments[0] === 'order' && segments[2] === 'eligible-items' && req.method === 'GET') {
      const caller = await requireCallerProfile(req)
      const orderId = segments[1] as string
      return okResponse(await returns.listReturnableItemsForOrder(admin, caller.id, orderId))
    }

    // GET /admin?status=
    if (segments.length === 1 && segments[0] === 'admin' && req.method === 'GET') {
      await requireAdmin(req)
      const status = url.searchParams.get('status')
      if (status && !isReturnStatus(status)) throw new ValidationError(`Unrecognized return status "${status}".`)
      const limitParam = url.searchParams.get('limit')
      return okResponse(
        await returns.listReturnsForAdmin(admin, { status: status ?? undefined, limit: limitParam ? Number(limitParam) : undefined }),
      )
    }

    const caller = await requireCallerProfile(req)

    // POST / — create a return request
    if (segments.length === 0 && req.method === 'POST') {
      const input = parseOrThrow(createReturnRequestSchema, body)
      const created = await returns.createReturnRequest(admin, caller.id, input)
      return okResponse(created, 201)
    }

    // GET / — list my returns
    if (segments.length === 0 && req.method === 'GET') {
      return okResponse({ returns: await returns.listMyReturns(admin, caller.id) })
    }

    const [returnId, ...rest] = segments
    if (!returnId) throw new NotFoundError('route', 'No matching route for this method/path on the returns function.')

    // GET /:id
    if (rest.length === 0 && req.method === 'GET') {
      return okResponse(await returns.getReturnForCaller(admin, caller.id, caller.isAdmin, returnId))
    }

    // Everything past here is admin-only.
    if (rest.length === 1 && req.method === 'POST') {
      const adminCaller = await requireAdmin(req)

      if (rest[0] === 'review') {
        const input = parseOrThrow(returnReviewSchema, body)
        return okResponse(await returns.moveReturnUnderReview(admin, returnId, adminCaller, input.note))
      }

      if (rest[0] === 'approve') {
        const input = parseOrThrow(returnDecisionSchema, body)
        const courierProvider = new LeopardsCourierProvider(getLeopardsConfig())
        const result = await returns.approveReturn(admin, courierProvider, returnId, adminCaller, input.note)
        return okResponse(result)
      }

      if (rest[0] === 'reject') {
        const input = parseOrThrow(returnDecisionSchema, body)
        return okResponse(await returns.rejectReturn(admin, returnId, adminCaller, input.note))
      }

      if (rest[0] === 'received') {
        const input = parseOrThrow(returnDecisionSchema, body)
        return okResponse(await returns.markReturnReceived(admin, returnId, adminCaller, input.note))
      }

      if (rest[0] === 'inspection') {
        const input = parseOrThrow(recordInspectionOutcomeSchema, body)
        const updated = await returns.recordInspectionOutcome(admin, returnId, input, adminCaller)

        if (input.resolution === 'refund') {
          const easypaisaProvider = new EasypaisaProvider(getEasypaisaConfig())
          const erpProvider = new LedGixErpProvider(getLedGixConfig())
          const refundResult = await processReturnRefund(admin, easypaisaProvider, erpProvider, returnId, adminCaller)
          return okResponse({ returnRecord: updated, refund: refundResult })
        }

        return okResponse({ returnRecord: updated })
      }

      if (rest[0] === 'close') {
        const input = parseOrThrow(returnDecisionSchema, body)
        return okResponse(await returns.closeReturn(admin, returnId, adminCaller, input.note))
      }
    }

    throw new ValidationError('No matching route for this method/path on the returns function.')
  }),
)
