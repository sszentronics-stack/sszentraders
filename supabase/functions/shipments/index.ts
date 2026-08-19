/**
 * shipments — maps to backend/services/delivery/leopards. Phase 1 defines
 * the `shipments`/`shipment_events` schema (0008_shipments.sql) and the
 * CourierProvider interface (backend/lib/providers/CourierProvider.ts); no
 * live courier calls happen until Phase 11.
 */
import { withErrorHandling } from '../_shared/http.ts'
import { NotImplementedYetError } from '../../../backend/lib/errors/index.ts'

Deno.serve(
  withErrorHandling(async () => {
    throw new NotImplementedYetError('Shipment creation/tracking', 'Phase 11 (Leopards Courier Integration)')
  }),
)
