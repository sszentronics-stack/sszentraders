/**
 * accounting — Phase 7 (Local Operational Accounting Layer) + Phase 8
 * (LedGix ERP Integration) admin surface.
 *
 * Financial events themselves are recorded by
 * backend/services/accounting/accounting.service.ts, called directly from
 * commerce domain-event call sites (e.g. orders.service.ts's createOrder())
 * — NOT through this Edge Function. This function is the admin-facing
 * operational-diagnostics + ERP-sync-trigger surface. No accounting UI
 * ships in this phase (that's Phase 12) — this is deliberately the minimal
 * admin API a future page (or an operator via curl/Postman) can build on.
 *
 *   GET  /unsynced          list local financial events not yet synced to
 *                           ERP (pending/in_progress/failed, or missing a
 *                           sync job entirely) — admin only
 *   POST /:id/retry         requeue one financial event's ERP sync job to
 *                           `pending` (creating it if missing), audited —
 *                           admin only [Phase 7]
 *   POST /:id/sync          attempt a REAL LedGix ERP sync for one
 *                           financial event right now, audited — admin
 *                           only [Phase 8]. Today this always resolves to
 *                           `failed` with a "LedGix ERP integration is not
 *                           configured" message (see
 *                           backend/services/erp/ledgix/sync.service.ts) —
 *                           it never fabricates a success.
 *   GET  /erp/health         { configured, pendingSyncCount } — never
 *                           leaks credential values — admin only [Phase 8]
 *   GET  /erp/reconciliation run the local-vs-ERP reconciliation check
 *                           (backend/services/erp/ledgix/reconciliation.service.ts)
 *                           — admin only [Phase 8]. No "list ERP documents"
 *                           capability exists yet, so this compares against
 *                           an empty ERP snapshot today (every
 *                           locally-succeeded record — there are none —
 *                           would surface as missing); the comparison logic
 *                           itself is real and tested.
 *   GET  /integrations/status  { ledgix: {configured}, easypaisa: {configured},
 *                           leopards: {configured} } — admin only [Phase 12].
 *                           Booleans only, computed from whether each
 *                           integration's required secrets are present (see
 *                           ../_shared/config.ts) — never returns a secret
 *                           value itself. Lives here (rather than a new
 *                           function) because it's the same "admin
 *                           operational diagnostics" surface as /erp/health.
 *
 * SCHEDULING: once Phase 8's sync worker has real credentials, it would run
 * periodically via one of two serverless-compatible mechanisms (no
 * persistent Node process/background daemon is available on Hostinger
 * static hosting):
 *   1. Supabase's built-in pg_cron + pg_net extensions, scheduling a
 *      periodic `select net.http_post(...)` that invokes this (or a
 *      dedicated) Edge Function directly from Postgres, or
 *   2. An external cron trigger (e.g. GitHub Actions on a schedule, or a
 *      third-party cron-to-webhook service) hitting it on an interval.
 * Neither is wired up here — `POST /:id/sync` is the on-demand equivalent
 * an operator (or a future admin UI, Phase 12) can call today.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { getEasypaisaConfig, getLedGixConfig, getLeopardsConfig } from '../_shared/config.ts'
import { NotFoundError, ValidationError } from '../../../backend/lib/errors/index.ts'
import { LedGixErpProvider } from '../../../backend/lib/providers/ledgix/LedGixErpProvider.ts'
import * as accounting from '../../../backend/services/accounting/accounting.service.ts'
import { attemptErpSync } from '../../../backend/services/erp/ledgix/sync.service.ts'
import { getErpHealthStatus } from '../../../backend/services/erp/ledgix/health.service.ts'
import { runErpReconciliation } from '../../../backend/services/erp/ledgix/reconciliation.service.ts'

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

    // POST /:id/sync — Phase 8: attempt a real LedGix ERP sync right now.
    if (segments.length === 2 && segments[1] === 'sync' && req.method === 'POST') {
      const transactionId = segments[0]
      const provider = new LedGixErpProvider(getLedGixConfig())
      const result = await attemptErpSync(admin, provider, admin, transactionId, { id: caller.profileId, type: 'admin' })
      return okResponse(result)
    }

    // GET /erp/health — Phase 8: configuration status, never credential values.
    if (segments.length === 2 && segments[0] === 'erp' && segments[1] === 'health' && req.method === 'GET') {
      const status = await getErpHealthStatus(admin, getLedGixConfig())
      return okResponse(status)
    }

    // GET /erp/reconciliation — Phase 8: local-vs-ERP discrepancy check.
    if (segments.length === 2 && segments[0] === 'erp' && segments[1] === 'reconciliation' && req.method === 'GET') {
      const issues = await runErpReconciliation(admin)
      return okResponse({ issues })
    }

    // GET /integrations/status — Phase 12: booleans only, never secret values.
    if (segments.length === 2 && segments[0] === 'integrations' && segments[1] === 'status' && req.method === 'GET') {
      return okResponse({
        ledgix: { configured: getLedGixConfig() !== null },
        easypaisa: { configured: getEasypaisaConfig() !== null },
        leopards: { configured: getLeopardsConfig() !== null },
      })
    }

    throw new NotFoundError('route', 'No matching route for this method/path on the accounting function.')
  }),
)
