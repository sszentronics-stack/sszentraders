/**
 * integrations-leopards — thin wrapper around the raw
 * LeopardsCourierProvider (backend/lib/providers/leopards), plus the
 * inbound webhook/callback receiver. Domain-level shipment/order
 * orchestration (booking from an order, tracking timelines, admin
 * reconciliation) lives in supabase/functions/shipments/index.ts instead —
 * this function stays a direct provider passthrough (matching
 * integrations-ledgix/index.ts's naming convention) plus the one thing that
 * genuinely belongs at the provider-integration boundary: verifying and
 * routing an inbound courier callback.
 *
 * Every non-webhook operation still throws IntegrationNotConfiguredError
 * today — see backend/lib/providers/leopards/LeopardsCourierProvider.ts.
 */
import { withErrorHandling, okResponse, jsonResponse } from '../_shared/http.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { getLeopardsConfig, getLeopardsWebhookSecret } from '../_shared/config.ts'
import { LeopardsCourierProvider } from '../../../backend/lib/providers/leopards/LeopardsCourierProvider.ts'
import { ValidationError } from '../../../backend/lib/errors/index.ts'
import { verifyLeopardsWebhookSignature, WebhookSecretNotConfiguredError } from '../../../backend/services/delivery/leopards/webhook.ts'
import { applyRawStatusUpdate, findShipmentByTrackingNumber } from '../../../backend/services/delivery/leopards/tracking.service.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const provider = new LeopardsCourierProvider(getLeopardsConfig())

    // The webhook path needs the RAW body text (for signature verification)
    // before any JSON parsing, so it's handled separately from the
    // operation-switch below, which parses JSON directly.
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname.endsWith('/webhook')) {
      const rawBody = await req.text()
      const secret = getLeopardsWebhookSecret()
      if (!secret) {
        // Fail closed, not open: an unconfigured webhook secret must never
        // be treated as "signature verification passed".
        return jsonResponse({ error: 'Leopards webhook secret is not configured.' }, 501)
      }

      const signatureHeader = req.headers.get('x-leopards-signature') ?? req.headers.get('X-Leopards-Signature')
      const verified = await verifyLeopardsWebhookSignature({ rawBody, signatureHeader, secret }).catch((err) => {
        if (err instanceof WebhookSecretNotConfiguredError) return false
        throw err
      })
      if (!verified) {
        return jsonResponse({ error: 'Webhook signature verification failed.' }, 401)
      }

      // Best-guess payload shape pending real Leopards webhook docs — see
      // backend/services/delivery/leopards/webhook.ts's header comment.
      const payload = JSON.parse(rawBody) as { trackingNumber?: string; status?: string; eventAt?: string }
      if (!payload.trackingNumber || !payload.status) {
        throw new ValidationError('Webhook payload is missing trackingNumber/status.')
      }

      const db = getSupabaseAdminClient()
      const shipment = await findShipmentByTrackingNumber(db, payload.trackingNumber)
      if (!shipment) {
        // Acknowledge (200) rather than error — an unknown tracking number
        // is not something a retrying webhook sender should keep failing on.
        return okResponse({ acknowledged: true, matched: false })
      }

      await applyRawStatusUpdate(db, shipment, {
        rawStatus: payload.status,
        eventAt: payload.eventAt ?? new Date().toISOString(),
        eventType: 'webhook_callback',
        rawPayload: JSON.parse(rawBody),
      })
      return okResponse({ acknowledged: true, matched: true })
    }

    const body = await req.json().catch(() => ({}))
    const operation = body.operation ?? 'createShipment'

    switch (operation) {
      case 'trackShipment':
        return okResponse(await provider.trackShipment(body.input))
      case 'cancelShipment':
        await provider.cancelShipment(body.input)
        return okResponse({ cancelled: true })
      case 'requestPickup':
        return okResponse(await provider.requestPickup(body.input))
      case 'bookReturnPickup':
        return okResponse(await provider.bookReturnPickup(body.input))
      case 'createShipment':
      default:
        return okResponse(await provider.createShipment(body.input))
    }
  }),
)
