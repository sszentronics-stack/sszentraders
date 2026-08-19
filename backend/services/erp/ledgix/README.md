# ledgix

**Phase:** 8, 9, 15

LedGix ERP integration — authoritative accounting, inventory truth, and financial reporting for the Aura Beauty Care company in LedGix.

Flow: Aura event → local transaction → LedGix ERP API → ERP confirmation → local sync.

ERP-generated documents (invoice, receipt, refund/credit) are stored against the Aura order. Aura must not independently mutate inventory once this integration is active — see `backend/services/inventory`.

Status: not started (Phase 1 laid the foundation below).

## Phase 1 foundation
- Interface: `backend/lib/providers/ErpProvider.ts`.
- Skeleton implementation: `backend/lib/providers/ledgix/LedGixErpProvider.ts` — every method throws `IntegrationNotConfiguredError` until real credentials + Phase 8/9 logic land. It never fabricates a successful sync.
- Deployable code home: `supabase/functions/integrations-ledgix/index.ts`.
- Schema: `supabase/migrations/0011_accounting_erp_sync.sql`, `0012_inventory_cache.sql`.
