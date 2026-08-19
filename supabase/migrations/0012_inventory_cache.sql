-- 0012_inventory_cache.sql
-- Cache only. LedGix ERP is the sole authoritative inventory source
-- (Phase 9). No local inventory-adjustment features exist in Phase 1 —
-- this table is written to only by the future ERP sync job.

create table inventory_cache (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants (id) on delete cascade,
  ledgix_item_id text,
  quantity_on_hand integer not null default 0,
  quantity_available integer not null default 0,
  quantity_reserved integer not null default 0,
  last_synced_at timestamptz,
  sync_status erp_sync_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_inventory_cache_variant_id unique (variant_id),
  constraint chk_inventory_cache_quantities_nonnegative check (
    quantity_on_hand >= 0 and quantity_available >= 0 and quantity_reserved >= 0
  )
);

create trigger trg_inventory_cache_updated_at
  before update on inventory_cache
  for each row execute function set_updated_at();

create index idx_inventory_cache_variant_id on inventory_cache (variant_id);
create index idx_inventory_cache_sync_status on inventory_cache (sync_status);
create unique index uq_inventory_cache_ledgix_item_id on inventory_cache (ledgix_item_id) where ledgix_item_id is not null;

comment on table inventory_cache is 'Synced operational copy of LedGix ERP inventory. Never independently authoritative — never mutate quantities here except from the ERP sync process.';
