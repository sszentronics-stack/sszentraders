/**
 * accounting — Phase 7 (Local Operational Accounting Layer).
 *
 * Financial events themselves are recorded by
 * backend/services/accounting/accounting.service.ts, called directly from
 * commerce domain-event call sites (e.g. orders.service.ts's createOrder())
 * — NOT through this Edge Function. This function exists only for the
 * admin-facing operational-diagnostics surface the phase spec asks for: a
 * read-only view of unsynced/failed local financial events, and a manual
 * retry primitive Phase 8's real sync worker will eventually call on a
 * schedule (documented below). No accounting UI ships in this phase (that's
 * Phase 12) — this is deliberately the minimal admin API a future page (or
 * an operator via curl/Postman) can build on.
 *
 *   GET  /unsynced         list local financial events not yet synced to
 *                          ERP (pending/in_progress/failed, or missing a
 *                          sync job entirely) — admin only
 *   POST /:id/retry        requeue one financial event's ERP sync job to
 *                          `pending` (creating it if missing), audited —
 *                          admin only
 *
 * FUTURE SCHEDULING (not wired up in this phase — no live Supabase project
 * exists here to configure it against): once Phase 8 implements the real
 * LedGix sync worker, it would run periodically via one of two serverless-
 * compatible mechanisms (no persistent Node process/background daemon is
 * available on Hostinger static hosting):
 *   1. Supabase's built-in pg_cron + pg_net extensions, scheduling a
 *      periodic `select net.http_post(...)` that invokes a dedicated sync
 *      Edge Function directly from Postgres, or
 *   2. An external cron trigger (e.g. GitHub Actions on a schedule, or a
 *      third-party cron-to-webhook service) hitting that Edge Function on
 *      an interval.
 * Either way, the retry primitive here already returns the exact shape
 * that worker would call on every `pending`/`failed` row it finds via
 * listUnsyncedFinancialEvents() — this phase intentionally does not set up
 * either scheduler, per the "do not actually implement Phase 8" instruction.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { NotFoundError, ValidationError } from '../../../backend/lib/errors/index.ts'
import * as accounting from '../../../backend/services/accounting/accounting.service.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?accounting\/?/, '').split('/').filter(Boolean)
    const admin = getSupabaseAdminClient()

    const caller = await requireAdmin(req)

    // GET /unsynced
    if (segments.length === 1 && segments[0] === 'unsynced' && req.method === 'GET') {
      const limitParam = url.searchParams.get('limit')
      const limit = limitParam ? Number(limitParam) : undefined
      if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0 || limit > 500)) {
        throw new ValidationError('limit must be an integer between 1 and 500.')
      }
      const events = await accounting.listUnsyncedFinancialEvents(admin, limit)
      return okResponse({ events })
    }

    // POST /:id/retry
    if (segments.length === 2 && segments[1] === 'retry' && req.method === 'POST') {
      const transactionId = segments[0]
      await accounting.retryFinancialEventSync(admin, admin, transactionId, { id: caller.profileId, type: 'admin' })
      return okResponse({ transactionId, status: 'pending' })
    }

    throw new NotFoundError('route', 'No matching route for this method/path on the accounting function.')
  }),
)
