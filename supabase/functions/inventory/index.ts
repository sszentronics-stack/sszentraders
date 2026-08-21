/**
 * inventory — Phase 9 (ERP-Controlled Inventory & Availability
 * Synchronization). Admin-only: variant<->LedGix item mapping and
 * triggering a sync-now against the live ERP inventory snapshot. Public
 * availability reads do NOT go through this function — the storefront
 * reads inventory_cache directly via the anon-key client + RLS
 * (0021_inventory_cache_public_read.sql), field-scoped in
 * src/repositories/products.repository.ts, exactly like every other public
 * catalog read in this codebase. Cart/checkout revalidation reads
 * inventory_cache directly from the service-role client inside
 * backend/services/cart/cart.service.ts / backend/services/orders/orders.service.ts
 * — no HTTP round trip needed since those already run server-side.
 *
 *   POST   /sync              trigger an on-demand ERP inventory sync
 *                              (no scheduler exists — see
 *                              backend/services/inventory/inventory.service.ts's
 *                              header for why; same pattern as Phase 8's
 *                              POST /accounting/:id/sync)
 *   GET    /unmapped           list published variants with no LedGix item mapping
 *   POST   /map                 map a variant to a LedGix item id {variantId, ledgixItemId}
 *   DELETE /map/:variantId     remove a variant's LedGix item mapping
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { getLedGixConfig } from '../_shared/config.ts'
import { LedGixErpProvider } from '../../../backend/lib/providers/ledgix/LedGixErpProvider.ts'
import { NotFoundError } from '../../../backend/lib/errors/index.ts'
import { inventoryMappingInputSchema, parseOrThrow } from '../../../backend/lib/validation/index.ts'
import * as inventory from '../../../backend/services/inventory/inventory.service.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?inventory\/?/, '').split('/').filter(Boolean)
    const admin = getSupabaseAdminClient()
    const caller = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))

    if (segments[0] === 'sync' && req.method === 'POST') {
      const provider = new LedGixErpProvider(getLedGixConfig())
      const result = await inventory.syncInventoryFromErp(admin, provider, admin, { id: caller.profileId, type: 'admin' })
      return okResponse(result)
    }

    if (segments[0] === 'unmapped' && req.method === 'GET') {
      return okResponse({ variants: await inventory.listUnmappedVariants(admin) })
    }

    if (segments[0] === 'map' && req.method === 'POST' && segments.length === 1) {
      const input = parseOrThrow(inventoryMappingInputSchema, body)
      await inventory.mapVariantToErpItem(admin, input.variantId, input.ledgixItemId)
      return okResponse({ ok: true }, 201)
    }

    if (segments[0] === 'map' && req.method === 'DELETE' && segments.length === 2) {
      await inventory.unmapVariant(admin, segments[1])
      return okResponse({ ok: true })
    }

    throw new NotFoundError('route', 'No matching route for this method/path on the inventory function.')
  }),
)
