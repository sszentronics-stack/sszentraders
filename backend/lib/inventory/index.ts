/**
 * Pure inventory-availability domain rules — Phase 9 (ERP-Controlled
 * Inventory & Availability Synchronization). Nothing here touches a
 * database or the network (that's backend/services/inventory/
 * inventory.service.ts); unit-testable without a live Supabase project,
 * same pattern as backend/lib/erp and backend/lib/cart.
 *
 * LedGix ERP is the sole authoritative inventory movement system
 * (inventory_cache, 0012_inventory_cache.sql, is a synced operational
 * copy only). Nothing in this module — or anywhere in Phase 9 — invents a
 * local +/- stock adjustment; every quantity here either came from a real
 * ErpProvider.getInventorySnapshot() call or is "we don't have reliable
 * data for this variant yet."
 */

export type AvailabilityState = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown'

const DEFAULT_LOW_STOCK_THRESHOLD = 5

/**
 * Derive a storefront-facing availability state from a synced cache row.
 * `null`/`undefined` quantity (no cache row — variant not yet ERP-mapped or
 * never synced) is deliberately `'unknown'`, never `'in_stock'`: "show
 * useful availability states only when backed by reliable values" (spec) —
 * an unmapped variant stays purchasable (see assessCheckoutAvailability)
 * but the UI must not claim a stock level it doesn't actually have.
 */
export function computeAvailabilityState(
  quantityAvailable: number | null | undefined,
  lowStockThreshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): AvailabilityState {
  if (quantityAvailable == null) return 'unknown'
  if (quantityAvailable <= 0) return 'out_of_stock'
  if (quantityAvailable <= lowStockThreshold) return 'low_stock'
  return 'in_stock'
}

export interface CheckoutAvailabilityResult {
  /** Whether this quantity can be sold at all right now. */
  ok: boolean
  /** The quantity that's actually safe to sell — may be less than requested when the cache reports a lower number. Equal to the requested quantity when availability is unknown (no reliable cache data — never block a sale on missing data alone). */
  allowedQuantity: number
  reason?: 'out_of_stock' | 'insufficient_stock'
}

/**
 * The single decision cart/checkout revalidation calls before accepting a
 * line — "revalidate before checkout ... never oversell based solely on
 * old browser state." A variant with no reliable cache data (`null`
 * quantityAvailable) is allowed at the requested quantity: Phase 9 must not
 * silently block sales for the (very likely, for a while) many SKUs that
 * aren't ERP-mapped yet — see this module's header and the "do not break
 * existing working customer flow" project rule.
 */
export function assessCheckoutAvailability(
  requestedQuantity: number,
  quantityAvailable: number | null | undefined,
): CheckoutAvailabilityResult {
  if (quantityAvailable == null) {
    return { ok: true, allowedQuantity: requestedQuantity }
  }
  if (quantityAvailable <= 0) {
    return { ok: false, allowedQuantity: 0, reason: 'out_of_stock' }
  }
  if (requestedQuantity > quantityAvailable) {
    return { ok: true, allowedQuantity: quantityAvailable, reason: 'insufficient_stock' }
  }
  return { ok: true, allowedQuantity: requestedQuantity }
}

const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * A cache row is "stale" once it's old enough that its quantity shouldn't
 * be trusted for a purchase decision without a fresh sync — used for admin
 * visibility ("stale/unmapped products" per spec), not to block checkout by
 * itself (checkout always reads whatever the cache currently says; staleness
 * is a signal for an operator to trigger a re-sync, not an automatic block).
 */
export function isInventoryCacheStale(
  lastSyncedAt: string | null | undefined,
  now: Date = new Date(),
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): boolean {
  if (!lastSyncedAt) return true
  return now.getTime() - new Date(lastSyncedAt).getTime() > staleAfterMs
}

export interface InventorySnapshotInput {
  ledgixItemId: string
  quantityOnHand: number
  quantityAvailable: number
  quantityReserved: number
  syncedAt: string
}

export interface InventoryCacheUpsert {
  variantId: string
  ledgixItemId: string
  quantityOnHand: number
  quantityAvailable: number
  quantityReserved: number
  lastSyncedAt: string
  syncStatus: 'succeeded'
}

/**
 * Turn a batch of ERP snapshots into the exact rows to upsert into
 * inventory_cache, given the variant<->ledgix_item_id mapping already on
 * file (product_variants.ledgix_item_id). A snapshot for an item id with no
 * known mapping is silently dropped — Aura never invents a variant to
 * attach a stray ERP item id to; that would be exactly the kind of
 * "unsupported stock concept" the spec forbids inventing.
 */
export function buildInventoryCacheUpserts(
  snapshots: InventorySnapshotInput[],
  variantIdByLedgixItemId: Map<string, string>,
): InventoryCacheUpsert[] {
  const upserts: InventoryCacheUpsert[] = []
  for (const snapshot of snapshots) {
    const variantId = variantIdByLedgixItemId.get(snapshot.ledgixItemId)
    if (!variantId) continue
    upserts.push({
      variantId,
      ledgixItemId: snapshot.ledgixItemId,
      quantityOnHand: snapshot.quantityOnHand,
      quantityAvailable: snapshot.quantityAvailable,
      quantityReserved: snapshot.quantityReserved,
      lastSyncedAt: snapshot.syncedAt,
      syncStatus: 'succeeded',
    })
  }
  return upserts
}
