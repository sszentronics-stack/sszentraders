/**
 * integrations-easypaisa — maps to backend/services/payments/easypaisa.
 * Wires the EasypaisaProvider skeleton to live Edge Function config. Every
 * call throws IntegrationNotConfiguredError until Phase 10. See
 * integrations-ledgix/index.ts for the naming-convention note.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { getEasypaisaConfig } from '../_shared/config.ts'
import { EasypaisaProvider } from '../../../backend/lib/providers/easypaisa/EasypaisaProvider.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const provider = new EasypaisaProvider(getEasypaisaConfig())
    const body = await req.json().catch(() => ({}))
    const operation = body.operation ?? 'initiatePayment'

    switch (operation) {
      case 'verifyPayment':
        return okResponse(await provider.verifyPayment(body.input))
      case 'refundPayment':
        return okResponse(await provider.refundPayment(body.input))
      case 'initiatePayment':
      default:
        return okResponse(await provider.initiatePayment(body.input))
    }
  }),
)
