# inventory

**Phase:** 9

Local synchronized inventory cache for storefront performance. LedGix ERP is the source of truth (`backend/services/erp/ledgix`); this service only mirrors ERP-confirmed stock movements (purchases, sales, cancellations, returns, damage, adjustments, transfers).

Availability flow: LedGix ERP → Aura inventory sync → storefront availability.

Status: **implemented.** See `docs/phase-9-completion-report.md` for the full writeup.

## Phase 1 foundation
- Schema (cache only, no adjustment features): `supabase/migrations/0012_inventory_cache.sql`.
- The `getInventorySnapshot` method on `backend/lib/providers/ledgix/LedGixErpProvider.ts` is the sync source (still throws `IntegrationNotConfiguredError` — no real LedGix credentials exist in this project).

## Phase 9 implementation
- Schema addition: `supabase/migrations/0021_inventory_cache_public_read.sql` (RLS: storefront can read availability for published-product variants; every write stays admin/service-role only).
- Pure domain logic: `backend/lib/inventory` (availability state, checkout-quantity clamping, cache-staleness, ERP-snapshot-to-cache-row mapping) — unit tested.
- Admin mapping + sync worker: `backend/services/inventory/inventory.service.ts`, mirroring `backend/services/erp/ledgix/sync.service.ts`'s "attempt, never fabricate a number, mark terminal state, audit every attempt" pattern.
- Edge Function: `supabase/functions/inventory/index.ts` (admin-only: sync-now, unmapped-variant visibility, mapping CRUD).
- Cart/checkout revalidation (`backend/services/cart/cart.service.ts`, `backend/services/orders/orders.service.ts`) reads `inventory_cache` directly and blocks/clamps on real out-of-stock data, never on invented state.
- Storefront: `src/repositories/products.repository.ts` reads availability alongside catalog data; `ProductCard`/`Product`/`Shop` show real in-stock/low-stock/out-of-stock badges instead of the Phase 3 `inStock: true` placeholder.
