/**
 * orders — Phase 6 (Checkout & Order Management). Replaces the Phase 1
 * validate-and-501 stub with real order creation/read/cancellation on top
 * of the Phase 5 server-side cart.
 *
 *   POST   /              create an order from the caller's current cart
 *                          (requires an `X-Idempotency-Key` header — see
 *                          the idempotency handling below; CORS already
 *                          allowlists this header, see ../_shared/http.ts)
 *   GET    /               list the caller's own orders, newest first
 *   GET    /:id            read one order (caller-owned, or admin)
 *   POST   /:id/cancel     request cancellation (pending/confirmed only)
 *   POST   /lookup          guest order lookup {orderNumber, email}
 *
 * Every route requires a caller JWT (signed-in OR anonymous-auth guest —
 * see ../_shared/callerAuth.ts), same identity model Phase 5 established
 * for cart/wishlist. `/lookup` is the one exception: it authenticates by
 * order-number + email match instead, for a guest returning in a different
 * browser session where their original anonymous session no longer exists.
 *
 * SECURITY: getOrderForCaller() (orders.service.ts) always throws a
 * generic NotFoundError for "exists but isn't yours" — never a distinct
 * 403 — so this function can't be used to enumerate/confirm the existence
 * of another customer's order by id.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireCallerProfile } from '../_shared/callerAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { NotFoundError, ConflictError, ValidationError } from '../../../backend/lib/errors/index.ts'
import { buildPendingIdempotencyRecord, decideIdempotency, type IdempotencyRecord } from '../../../backend/lib/idempotency/index.ts'
import {
  cancelOrderRequestSchema,
  checkoutSchema,
  guestOrderLookupSchema,
  parseOrThrow,
} from '../../../backend/lib/validation/index.ts'
import { writeAuditLog } from '../../../backend/lib/audit/index.ts'
import * as orders from '../../../backend/services/orders/orders.service.ts'
import { sendOrderConfirmationEmail } from '../../../backend/lib/orders/confirmationEmail.ts'

const IDEMPOTENCY_SCOPE = 'order.create'

async function loadIdempotencyRecord(admin: ReturnType<typeof getSupabaseAdminClient>, key: string): Promise<IdempotencyRecord | null> {
  const { data } = await admin.from('idempotency_keys').select('*').eq('key', key).maybeSingle()
  if (!data) return null
  return {
    key: data.key as string,
    scope: data.scope as string,
    requestHash: data.request_hash as string,
    responseReference: data.response_reference as string | null,
    status: data.status as IdempotencyRecord['status'],
    expiresAt: data.expires_at as string,
  }
}

async function saveIdempotencyRecord(admin: ReturnType<typeof getSupabaseAdminClient>, record: IdempotencyRecord): Promise<void> {
  await admin.from('idempotency_keys').upsert({
    key: record.key,
    scope: record.scope,
    request_hash: record.requestHash,
    response_reference: record.responseReference,
    status: record.status,
    expires_at: record.expiresAt,
  })
}

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?orders\/?/, '').split('/').filter(Boolean)
    const admin = getSupabaseAdminClient()
    const body = await req.json().catch(() => ({}))

    if (segments[0] === 'lookup' && req.method === 'POST') {
      const input = parseOrThrow(guestOrderLookupSchema, body)
      return okResponse(await orders.lookupGuestOrder(admin, input.orderNumber, input.email))
    }

    const caller = await requireCallerProfile(req)

    // POST / — create order (idempotent)
    if (segments.length === 0 && req.method === 'POST') {
      const input = parseOrThrow(checkoutSchema, body)
      const idempotencyKey = req.headers.get('x-idempotency-key')
      if (!idempotencyKey) {
        throw new ValidationError('Missing X-Idempotency-Key header.')
      }

      const existing = await loadIdempotencyRecord(admin, idempotencyKey)
      const decision = await decideIdempotency(existing, body)

      if (decision.action === 'reject_conflict') {
        throw new ConflictError('This idempotency key was already used with a different request.')
      }
      if (decision.action === 'wait_for_in_flight') {
        throw new ConflictError('This order is already being created — please wait a moment and check your order history.')
      }
      if (decision.action === 'replay' && decision.responseReference) {
        const order = await orders.getOrderForCaller(admin, caller.id, caller.isAdmin, decision.responseReference)
        return okResponse(order, 200)
      }

      const pending = await buildPendingIdempotencyRecord({ key: idempotencyKey, scope: IDEMPOTENCY_SCOPE, payload: body })
      await saveIdempotencyRecord(admin, pending)

      try {
        const order = await orders.createOrder(admin, caller.id, input)
        try {
          await sendOrderConfirmationEmail(order, {
            apiKey: Deno.env.get('RESEND_API_KEY'),
            from: Deno.env.get('ORDER_FROM_EMAIL'),
          })
        } catch (mailError) {
          console.error('Order confirmation email was not sent.', mailError)
        }
        await saveIdempotencyRecord(admin, { ...pending, status: 'completed', responseReference: order.id })
        await writeAuditLog(admin, {
          actor: caller.id,
          actorType: 'customer',
          action: 'order.created',
          entityType: 'order',
          entityId: order.id,
          metadata: { orderNumber: order.orderNumber, grandTotal: order.grandTotal, itemCount: order.items.length },
        })
        return okResponse(order, 201)
      } catch (err) {
        await saveIdempotencyRecord(admin, { ...pending, status: 'failed' })
        throw err
      }
    }

    // GET / — list my orders
    if (segments.length === 0 && req.method === 'GET') {
      return okResponse({ orders: await orders.listOrdersForCaller(admin, caller.id) })
    }

    const [orderId, ...rest] = segments
    if (!orderId) throw new NotFoundError('Route')

    // POST /:id/cancel
    if (rest.length === 1 && rest[0] === 'cancel' && req.method === 'POST') {
      const input = parseOrThrow(cancelOrderRequestSchema, body)
      const order = await orders.requestOrderCancellation(admin, caller.id, caller.isAdmin, orderId, input.reason)
      await writeAuditLog(admin, {
        actor: caller.id,
        actorType: 'customer',
        action: 'order.cancellation_requested',
        entityType: 'order',
        entityId: orderId,
        metadata: { reason: input.reason ?? null },
      })
      return okResponse(order)
    }

    // GET /:id
    if (rest.length === 0 && req.method === 'GET') {
      return okResponse(await orders.getOrderForCaller(admin, caller.id, caller.isAdmin, orderId))
    }

    throw new NotFoundError('route', 'No matching route for this method/path on the orders function.')
  }),
)
