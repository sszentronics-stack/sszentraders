/**
 * ERP-controlled inventory: admin variant<->LedGix item mapping and the
 * inventory-cache sync worker — Phase 9 (ERP-Controlled Inventory &
 * Availability Synchronization). Mirrors
 * backend/services/erp/ledgix/sync.service.ts's "attempt, never fabricate
 * a number, mark a terminal state, audit every attempt" pattern exactly,
 * applied to inventory instead of accounting documents.
 *
 * inventory_cache (0012_inventory_cache.sql) is a synced operational copy
 * only — nothing in this file ever writes a quantity that didn't come
 * directly from a real ErpProvider.getInventorySnapshot() call. On a
 * failed/not-configured sync attempt, existing cached quantities are left
 * untouched (only sync_status changes) — never zeroed, never guessed.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ErpProvider } from '../../lib/providers/ErpProvider.ts'
import { IntegrationNotConfiguredError } from '../../lib/providers/errors.ts'
import { buildInventoryCacheUpserts } from '../../lib/inventory/index.ts'
import { ConflictError, NotFoundError } from '../../lib/errors/index.ts'
import { writeAuditLog, type AuditLogWriter } from '../../lib/audit/index.ts'

const UNIQUE_VIOLATION = '23505'
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === UNIQUE_VIOLATION)
}

// ---------------------------------------------------------------------------
// Admin variant <-> LedGix item mapping. Duplicate mappings are prevented
// at the database level (uq_product_variants_ledgix_item_id, 0005) — this
// just turns that constraint violation into a clean ConflictError, the
// same pattern products.service.ts uses for slug/SKU uniqueness.
// ---------------------------------------------------------------------------

export async function mapVariantToErpItem(db: SupabaseClient, variantId: string, ledgixItemId: string): Promise<void> {
  const { data: variant, error: fetchError } = await db.from('product_variants').select('id').eq('id', variantId).maybeSingle()
  if (fetchError) throw fetchError
  if (!variant) throw new NotFoundError('Product variant')

  const { error } = await db.from('product_variants').update({ ledgix_item_id: ledgixItemId }).eq('id', variantId)
  if (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`LedGix item id "${ledgixItemId}" is already mapped to another variant.`)
    throw error
  }
}

export async function unmapVariant(db: SupabaseClient, variantId: string): Promise<void> {
  const { error, count } = await db.from('product_variants').update({ ledgix_item_id: null }, { count: 'exact' }).eq('id', variantId)
  if (error) throw error
  if (!count) throw new NotFoundError('Product variant')
}

interface UnmappedVariantRow {
  id: string
  sku: string
  title: string | null
  product_id: string
  products: { name: string; status: string } | { name: string; status: string }[] | null
}

export interface UnmappedVariantSummary {
  variantId: string
  sku: string
  variantTitle: string | null
  productId: string
  productName: string
}

/** Every published, sellable variant with no LedGix item mapping yet — the admin visibility the spec asks for ("admin visibility for stale/unmapped products"). */
export async function listUnmappedVariants(db: SupabaseClient): Promise<UnmappedVariantSummary[]> {
  const { data, error } = await db
    .from('product_variants')
    .select('id, sku, title, product_id, products ( name, status )')
    .is('ledgix_item_id', null)
    .eq('status', 'published')
  if (error) throw error

  const rows = (data ?? []) as unknown as UnmappedVariantRow[]
  return rows
    .map((row) => ({ row, product: Array.isArray(row.products) ? row.products[0] : row.products }))
    .filter(({ product }) => product?.status === 'published')
    .map(({ row, product }) => ({
      variantId: row.id,
      sku: row.sku,
      variantTitle: row.title,
      productId: row.product_id,
      productName: product?.name ?? '',
    }))
}

// ---------------------------------------------------------------------------
// Sync worker
// ---------------------------------------------------------------------------

export interface InventorySyncResult {
  mappedVariantCount: number
  outcome: 'succeeded' | 'failed' | 'skipped'
  error?: string
  syncedVariantCount?: number
}

interface MappedVariantRow {
  id: string
  ledgix_item_id: string
}

/**
 * Pull the live ERP snapshot for every mapped variant (one batched
 * ErpProvider.getInventorySnapshot() call, matching that method's real
 * signature) and upsert inventory_cache. Exactly one audit log entry per
 * attempt — this is a privileged, security-sensitive action per the spec,
 * same as every ERP sync attempt in Phase 8.
 */
export async function syncInventoryFromErp(
  db: SupabaseClient,
  provider: ErpProvider,
  auditWriter: AuditLogWriter,
  actor: { id: string | null; type: 'admin' | 'system' },
  limit = 200,
): Promise<InventorySyncResult> {
  const { data: mapped, error } = await db
    .from('product_variants')
    .select('id, ledgix_item_id')
    .not('ledgix_item_id', 'is', null)
    .limit(limit)
  if (error) throw error

  const mappedVariants = (mapped ?? []) as MappedVariantRow[]
  if (mappedVariants.length === 0) {
    return { mappedVariantCount: 0, outcome: 'skipped', error: 'No variants are mapped to a LedGix item id yet.' }
  }

  const variantIdByLedgixItemId = new Map(mappedVariants.map((v) => [v.ledgix_item_id, v.id]))
  const ledgixItemIds = mappedVariants.map((v) => v.ledgix_item_id)

  try {
    const snapshots = await provider.getInventorySnapshot(ledgixItemIds)
    const upserts = buildInventoryCacheUpserts(snapshots, variantIdByLedgixItemId)

    for (const upsert of upserts) {
      const { error: upsertError } = await db.from('inventory_cache').upsert(
        {
          variant_id: upsert.variantId,
          ledgix_item_id: upsert.ledgixItemId,
          quantity_on_hand: upsert.quantityOnHand,
          quantity_available: upsert.quantityAvailable,
          quantity_reserved: upsert.quantityReserved,
          last_synced_at: upsert.lastSyncedAt,
          sync_status: 'succeeded',
        },
        { onConflict: 'variant_id' },
      )
      if (upsertError) throw upsertError
    }

    await writeAuditLog(auditWriter, {
      actor: actor.id,
      actorType: actor.type,
      action: 'inventory.sync_attempted',
      entityType: 'inventory',
      metadata: { outcome: 'succeeded', mappedVariantCount: mappedVariants.length, syncedVariantCount: upserts.length },
    })
    return { mappedVariantCount: mappedVariants.length, outcome: 'succeeded', syncedVariantCount: upserts.length }
  } catch (err) {
    const message =
      err instanceof IntegrationNotConfiguredError
        ? err.message
        : 'LedGix inventory sync failed with an unexpected error. See server logs for detail.'

    // Mark every mapped variant's cache row as failed (creating one at
    // zero quantities if none exists yet) so admin "stale/unmapped"
    // visibility can surface it. Only the columns listed below are ever
    // written on conflict — an existing row's quantity_on_hand/available/
    // reserved are left untouched (PostgREST upsert only updates the
    // columns provided), never zeroed or guessed on a failed sync.
    for (const variant of mappedVariants) {
      await db
        .from('inventory_cache')
        .upsert({ variant_id: variant.id, ledgix_item_id: variant.ledgix_item_id, sync_status: 'failed' }, { onConflict: 'variant_id' })
    }

    await writeAuditLog(auditWriter, {
      actor: actor.id,
      actorType: actor.type,
      action: 'inventory.sync_attempted',
      entityType: 'inventory',
      metadata: { outcome: 'failed', mappedVariantCount: mappedVariants.length, error: message },
    })
    return { mappedVariantCount: mappedVariants.length, outcome: 'failed', error: message }
  }
}

// ---------------------------------------------------------------------------
// Public/checkout availability read
// ---------------------------------------------------------------------------

export interface VariantAvailability {
  variantId: string
  quantityAvailable: number | null
  syncStatus: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'skipped' | null
  lastSyncedAt: string | null
}

interface InventoryCacheRow {
  variant_id: string
  quantity_available: number
  sync_status: string
  last_synced_at: string | null
}

/** Bulk-read availability for a set of variants — used by cart/checkout revalidation (backend/services/cart/cart.service.ts, backend/services/orders/orders.service.ts). A variant with no row is "unknown" (see backend/lib/inventory's header on why that's never treated as out of stock). */
export async function getAvailabilityForVariants(db: SupabaseClient, variantIds: string[]): Promise<Map<string, VariantAvailability>> {
  const result = new Map<string, VariantAvailability>()
  if (variantIds.length === 0) return result

  const { data, error } = await db
    .from('inventory_cache')
    .select('variant_id, quantity_available, sync_status, last_synced_at')
    .in('variant_id', variantIds)
  if (error) throw error

  for (const row of (data ?? []) as InventoryCacheRow[]) {
    result.set(row.variant_id, {
      variantId: row.variant_id,
      quantityAvailable: row.quantity_available,
      syncStatus: row.sync_status as VariantAvailability['syncStatus'],
      lastSyncedAt: row.last_synced_at,
    })
  }
  return result
}
