/**
 * integrations-leopards — maps to backend/services/delivery/leopards.
 * Wires the LeopardsCourierProvider skeleton to live Edge Function config.
 * Every call throws IntegrationNotConfiguredError until Phase 11. See
 * integrations-ledgix/index.ts for the naming-convention note.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { getLeopardsConfig } from '../_shared/config.ts'
import { LeopardsCourierProvider } from '../../../backend/lib/providers/leopards/LeopardsCourierProvider.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const provider = new LeopardsCourierProvider(getLeopardsConfig())
    const body = await req.json().catch(() => ({}))
    const operation = body.operation ?? 'createShipment'

    switch (operation) {
      case 'trackShipment':
        return okResponse(await provider.trackShipment(body.input))
      case 'cancelShipment':
        await provider.cancelShipment(body.input)
        return okResponse({ cancelled: true })
      case 'createShipment':
      default:
        return okResponse(await provider.createShipment(body.input))
    }
  }),
)
