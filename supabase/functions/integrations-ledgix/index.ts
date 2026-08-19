/**
 * integrations-ledgix — maps to backend/services/erp/ledgix. Wires the
 * LedGixErpProvider skeleton (backend/lib/providers/ledgix/LedGixErpProvider.ts)
 * to live Edge Function config, plus (Phase 8) the inbound webhook
 * receiver — matching integrations-easypaisa/integrations-leopards'
 * established shape of "thin provider passthrough + the one thing that
 * genuinely belongs at the provider-integration boundary: verifying and
 * acknowledging an inbound callback."
 *
 * Every non-webhook operation still throws IntegrationNotConfiguredError
 * today — this function never fabricates a success response. It is not
 * confirmed that LedGix sends webhooks at all (see
 * backend/lib/erp/webhook.ts's header) — this route only activates once
 * LEDGIX_WEBHOOK_SECRET is actually set, which it isn't in this
 * environment; until then the webhook path fails closed with 501.
 *
 * Named `integrations-ledgix` (flat, hyphenated) rather than nested under
 * `integrations/ledgix/` because the Supabase CLI's default deploy/serve
 * convention keys a function's route off its immediate folder name under
 * `supabase/functions/`; a flat name keeps `supabase functions deploy
 * integrations-ledgix` unambiguous. See docs/phase-1-backend-foundation.md.
 */
import { withErrorHandling, okResponse, jsonResponse } from '../_shared/http.ts'
import { getLedGixConfig, getLedGixWebhookSecret } from '../_shared/config.ts'
import { LedGixErpProvider } from '../../../backend/lib/providers/ledgix/LedGixErpProvider.ts'
import { verifyLedGixWebhookSignature, LedGixWebhookSecretNotConfiguredError } from '../../../backend/lib/erp/webhook.ts'
import { logger } from '../../../backend/lib/logger/index.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const provider = new LedGixErpProvider(getLedGixConfig())

    // The webhook path needs the RAW body text (for signature verification)
    // before any JSON parsing — same pattern integrations-leopards/index.ts
    // already uses for its own webhook route.
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname.endsWith('/webhook')) {
      const rawBody = await req.text()
      const secret = getLedGixWebhookSecret()
      if (!secret) {
        // Fail closed, not open: an unconfigured webhook secret must never
        // be treated as "signature verification passed".
        return jsonResponse({ error: 'LedGix webhook secret is not configured.' }, 501)
      }

      const signatureHeader = req.headers.get('x-ledgix-signature') ?? req.headers.get('X-LedGix-Signature')
      const verified = await verifyLedGixWebhookSignature({ rawBody, signatureHeader, secret }).catch((err) => {
        if (err instanceof LedGixWebhookSecretNotConfiguredError) return false
        throw err
      })
      if (!verified) {
        return jsonResponse({ error: 'Webhook signature verification failed.' }, 401)
      }

      // No confirmed LedGix webhook payload shape exists (see this file's
      // header). There is currently nothing in Aura's domain model this
      // webhook would need to act on — Phase 8's outbound sync
      // (backend/services/erp/ledgix/sync.service.ts) is push-only, and
      // Phase 9 (ERP-controlled inventory) is the eventual consumer of any
      // inbound LedGix event (e.g. an inventory adjustment made in LedGix
      // itself). This route intentionally just verifies and acknowledges
      // receipt for now, logging the event type for future wiring, rather
      // than guessing what to do with an unconfirmed payload shape.
      let payload: Record<string, unknown> = {}
      try {
        payload = JSON.parse(rawBody)
      } catch {
        // Malformed JSON body — still acknowledge (the signature already
        // verified authenticity); nothing to act on either way today.
      }
      logger.info('Verified LedGix webhook received (no handler wired yet — see Phase 9)', {
        eventType: typeof payload?.event === 'string' ? payload.event : 'unknown',
      })
      return okResponse({ acknowledged: true })
    }

    const body = await req.json().catch(() => ({}))
    const operation = body.operation ?? 'getInventorySnapshot'

    switch (operation) {
      case 'upsertCustomer':
        return okResponse(await provider.upsertCustomer(body.input))
      case 'createInvoice':
        return okResponse(await provider.createInvoice(body.input))
      case 'recordReceipt':
        return okResponse(await provider.recordReceipt(body.input))
      case 'recordCreditNote':
        return okResponse(await provider.recordCreditNote(body.input))
      case 'getInventorySnapshot':
      default:
        return okResponse(await provider.getInventorySnapshot(body.ledgixItemIds ?? []))
    }
  }),
)
