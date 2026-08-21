/**
 * payments — Phase 10 (Easypaisa Online Payments). Replaces the Phase 1
 * validate-and-501 stub with the real payment router.
 *
 *   POST   /easypaisa/initiate           start/retry an Easypaisa payment
 *                                         attempt for an order the caller
 *                                         owns (caller JWT required)
 *   POST   /easypaisa/callback           Easypaisa webhook (NO caller JWT —
 *                                         verified by HMAC signature instead,
 *                                         see ../../backend/services/payments/easypaisa/signature.ts)
 *   POST   /easypaisa/refund             admin-only refund initiation
 *   GET    /easypaisa/reconciliation/:id admin-only sanitized payment detail
 *
 * `EasypaisaProvider` (backend/lib/providers/easypaisa) is constructed here
 * from live Edge Function config (../_shared/config.ts's
 * getEasypaisaConfig()) and injected into the service layer — every real
 * provider call throws IntegrationNotConfiguredError until real
 * EASYPAISA_* secrets exist, which `withErrorHandling` (../_shared/http.ts)
 * already converts into a clean typed 501 response, never a crash and
 * never a fake success.
 *
 * COD is unaffected by this function — COD orders never touch payments/
 * easypaisa at all; see backend/services/orders/orders.service.ts.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireCallerProfile } from '../_shared/callerAuth.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { getEasypaisaConfig } from '../_shared/config.ts'
import { EasypaisaProvider } from '../../../backend/lib/providers/easypaisa/EasypaisaProvider.ts'
import { NotFoundError, ValidationError, AuthenticationError } from '../../../backend/lib/errors/index.ts'
import { easypaisaInitiateSchema, easypaisaRefundSchema, parseOrThrow } from '../../../backend/lib/validation/index.ts'
import { writeAuditLog } from '../../../backend/lib/audit/index.ts'
import { verifyWebhookSignature } from '../../../backend/lib/payments/easypaisa/signature.ts'
import * as easypaisa from '../../../backend/services/payments/easypaisa/easypaisa.service.ts'

/**
 * Sensitive-endpoint rate limiting: this Edge Function relies on
 * Supabase's project-level Edge Function rate limits and Hostinger/CDN edge
 * protection rather than a custom in-function limiter — there is no
 * persistent process here to hold counters in, and a correct distributed
 * limiter needs infrastructure (e.g. Redis) this project does not have.
 * Every sensitive call below is still fully audited via writeAuditLog, and
 * the webhook path additionally requires a valid HMAC signature before any
 * database write happens.
 */

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?payments\/?/, '').split('/').filter(Boolean)
    const admin = getSupabaseAdminClient()

    if (segments[0] !== 'easypaisa') {
      throw new NotFoundError('route', 'No matching route for this method/path on the payments function.')
    }
    const action = segments[1]

    // POST /easypaisa/initiate
    if (action === 'initiate' && req.method === 'POST') {
      const caller = await requireCallerProfile(req)
      const body = await req.json().catch(() => ({}))
      const input = parseOrThrow(easypaisaInitiateSchema, body)
      const provider = new EasypaisaProvider(getEasypaisaConfig())

      const result = await easypaisa.initiateEasypaisaPayment(admin, provider, {
        profileId: caller.id,
        isAdmin: caller.isAdmin,
        orderId: input.orderId,
        returnUrl: input.returnUrl,
      })

      await writeAuditLog(admin, {
        actor: caller.id,
        actorType: 'customer',
        action: 'payment.easypaisa.initiate_attempted',
        entityType: 'payment',
        entityId: result.payment.id,
        metadata: { orderId: input.orderId, status: result.payment.status },
      })

      return okResponse(result)
    }

    // POST /easypaisa/callback — webhook, no caller JWT. Verified by HMAC
    // signature instead. Must read the raw body BEFORE any JSON parsing,
    // since the signature is computed over the raw bytes.
    if (action === 'callback' && req.method === 'POST') {
      const config = getEasypaisaConfig()
      const rawBody = await req.text()
      const signatureHeader = req.headers.get('x-easypaisa-signature')

      const verified = config
        ? await verifyWebhookSignature({ secret: config.webhookSecret, rawBody, providedSignatureHex: signatureHeader })
        : false

      if (!verified) {
        await writeAuditLog(admin, {
          actor: null,
          actorType: 'integration',
          action: 'payment.easypaisa.callback_rejected',
          metadata: { reason: config ? 'invalid_signature' : 'not_configured' },
        })
        // Deliberately not IntegrationNotConfiguredError here even when
        // config is null — a signature failure and "not configured" both
        // mean the same thing to a caller we cannot trust: reject, do not
        // process. AuthenticationError -> 401, never a 200 "ok" that could
        // train a spoofed sender that unsigned callbacks are accepted.
        throw new AuthenticationError('Invalid or missing webhook signature.')
      }

      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(rawBody)
      } catch {
        throw new ValidationError('Callback body is not valid JSON.')
      }

      const result = await easypaisa.handleEasypaisaCallback(admin, payload)

      await writeAuditLog(admin, {
        actor: null,
        actorType: 'integration',
        action: 'payment.easypaisa.callback_processed',
        entityType: 'payment',
        entityId: result.paymentId ?? undefined,
        metadata: { decision: result.decision },
      })

      return okResponse({ received: true, decision: result.decision })
    }

    // POST /easypaisa/refund — admin only
    if (action === 'refund' && req.method === 'POST') {
      const adminCaller = await requireAdmin(req)
      const body = await req.json().catch(() => ({}))
      const input = parseOrThrow(easypaisaRefundSchema, body)
      const provider = new EasypaisaProvider(getEasypaisaConfig())

      const payment = await easypaisa.refundEasypaisaPayment(admin, provider, input)

      await writeAuditLog(admin, {
        actor: adminCaller.profileId,
        actorType: 'admin',
        action: 'payment.easypaisa.refund_attempted',
        entityType: 'payment',
        entityId: payment.id,
        metadata: { amount: input.amount, status: payment.status },
      })

      return okResponse(payment)
    }

    // GET /easypaisa/reconciliation/:paymentId — admin only
    if (action === 'reconciliation' && req.method === 'GET') {
      await requireAdmin(req)
      const paymentId = segments[2]
      if (!paymentId) throw new NotFoundError('Payment')
      return okResponse(await easypaisa.getPaymentReconciliationDetail(admin, paymentId))
    }

    throw new NotFoundError('route', 'No matching route for this method/path on the payments function.')
  }),
)
