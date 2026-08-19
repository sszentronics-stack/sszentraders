/**
 * integrations-ledgix — maps to backend/services/erp/ledgix. Wires the
 * LedGixErpProvider skeleton (backend/lib/providers/ledgix/LedGixErpProvider.ts)
 * to live Edge Function config. Every call throws
 * IntegrationNotConfiguredError until Phase 8 implements the real LedGix
 * HTTP calls — this function never fabricates a success response.
 *
 * Named `integrations-ledgix` (flat, hyphenated) rather than nested under
 * `integrations/ledgix/` because the Supabase CLI's default deploy/serve
 * convention keys a function's route off its immediate folder name under
 * `supabase/functions/`; a flat name keeps `supabase functions deploy
 * integrations-ledgix` unambiguous. See docs/phase-1-backend-foundation.md.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { getLedGixConfig } from '../_shared/config.ts'
import { LedGixErpProvider } from '../../../backend/lib/providers/ledgix/LedGixErpProvider.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const provider = new LedGixErpProvider(getLedGixConfig())
    const body = await req.json().catch(() => ({}))
    const operation = body.operation ?? 'getInventorySnapshot'

    switch (operation) {
      case 'upsertCustomer':
        return okResponse(await provider.upsertCustomer(body.input))
      case 'createInvoice':
        return okResponse(await provider.createInvoice(body.input))
      case 'recordReceipt':
        return okResponse(await provider.recordReceipt(body.input))
      case 'getInventorySnapshot':
      default:
        return okResponse(await provider.getInventorySnapshot(body.ledgixItemIds ?? []))
    }
  }),
)
