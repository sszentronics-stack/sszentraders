# inventory

**Phase:** 9

Local synchronized inventory cache for storefront performance. LedGix ERP is the source of truth (`backend/services/erp/ledgix`); this service only mirrors ERP-confirmed stock movements (purchases, sales, cancellations, returns, damage, adjustments, transfers).

Availability flow: LedGix ERP → Aura inventory sync → storefront availability.

Status: not started (Phase 1 laid the foundation below).

## Phase 1 foundation
- Schema (cache only, no adjustment features): `supabase/migrations/0012_inventory_cache.sql`.
- The `getInventorySnapshot` method on `backend/lib/providers/ledgix/LedGixErpProvider.ts` is the intended sync source once Phase 9 lands.
