/**
 * orders — maps to backend/services/orders. Phase 1 ships the request
 * validation shape (createOrderSchema) and the architecture (idempotency,
 * money, status helpers in backend/lib) that Phase 6 (Checkout & Order
 * Management) will build the real create/read/transition logic on top of.
 * No cart backend or checkout flow exists yet — this function intentionally
 * validates input and then reports NotImplementedYetError rather than
 * creating a real order or faking success.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { NotImplementedYetError } from '../../../backend/lib/errors/index.ts'
import { createOrderSchema, parseOrThrow } from '../../../backend/lib/validation/index.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    if (req.method !== 'POST') {
      return okResponse({ message: 'orders function accepts POST for order creation (Phase 6).' })
    }
    const body = await req.json().catch(() => ({}))
    // Validate the shape now so Phase 6 can build directly on this contract —
    // but do not create an order or touch inventory/payment yet.
    parseOrThrow(createOrderSchema, body)
    throw new NotImplementedYetError('Order creation', 'Phase 6 (Checkout & Order Management)')
  }),
)
