/** Admin inventory sync/mapping — wraps the `inventory` Edge Function (Phase 9). Deliberately no raw quantity edit: Phase 9 forbids it, only mapping + sync-request are exposed. */
import { callEdgeFunction } from '../../lib/supabase/functions'

export function listUnmappedVariants() {
  return callEdgeFunction<{ variants: any[] }>('inventory/unmapped', { method: 'GET' })
}

export function syncInventoryFromErp() {
  return callEdgeFunction<any>('inventory/sync', { method: 'POST' })
}

export function mapVariantToErpItem(variantId: string, ledgixItemId: string) {
  return callEdgeFunction<{ ok: boolean }>('inventory/map', { method: 'POST', body: { variantId, ledgixItemId } })
}

export function unmapVariant(variantId: string) {
  return callEdgeFunction<{ ok: boolean }>(`inventory/map/${variantId}`, { method: 'DELETE' })
}
