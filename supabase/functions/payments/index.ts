/**
 * payments — maps to backend/services/payments (and, once live,
 * backend/services/payments/easypaisa). Phase 1 defines the `payments`/
 * `payment_events` schema (0007_payments.sql) and the PaymentProvider
 * interface (backend/lib/providers/PaymentProvider.ts); no live payment
 * calls happen until Phase 10.
 */
import { withErrorHandling } from '../_shared/http.ts'
import { NotImplementedYetError } from '../../../backend/lib/errors/index.ts'

Deno.serve(
  withErrorHandling(async () => {
    throw new NotImplementedYetError('Payment processing', 'Phase 10 (Easypaisa Payments)')
  }),
)
