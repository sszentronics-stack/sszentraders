/**
 * accounting — maps to backend/services/accounting. Phase 1 defines the
 * local operational accounting schema (0011_accounting_erp_sync.sql:
 * local_financial_transactions, erp_sync_jobs, erp_sync_events) — the local
 * layer that will eventually reconcile against LedGix ERP (Phase 8) as the
 * authoritative source of truth. No accounting logic runs yet (Phase 7).
 */
import { withErrorHandling } from '../_shared/http.ts'
import { NotImplementedYetError } from '../../../backend/lib/errors/index.ts'

Deno.serve(
  withErrorHandling(async () => {
    throw new NotImplementedYetError('Local accounting recording', 'Phase 7 (Local Accounting Layer)')
  }),
)
