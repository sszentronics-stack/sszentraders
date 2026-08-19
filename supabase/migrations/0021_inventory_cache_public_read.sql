-- 0021_inventory_cache_public_read.sql
-- Phase 9 (ERP-Controlled Inventory & Availability Synchronization).
--
-- inventory_cache (0012_inventory_cache.sql) was created admin-only —
-- correct for Phase 1, since nothing read it yet. Phase 9 needs the
-- storefront to show real availability, which means the anon-key browser
-- client needs a scoped read path. This adds exactly that: a row is
-- readable only when its variant belongs to a published product, mirroring
-- product_variants_public_read's own join shape (0014_row_level_security.sql).
--
-- This is row-level only — it does not hide any column. The public
-- storefront repository (src/repositories/products.repository.ts) is
-- responsible for field-scoping its own select (quantity_available/
-- sync_status/last_synced_at only), exactly the same convention that
-- already keeps cost_price/ledgix_item_id out of the public product
-- select. ledgix_item_id itself stays admin-only in every existing
-- product_variants policy — this migration does not touch that.

create policy inventory_cache_public_read on inventory_cache
  for select using (
    exists (
      select 1 from product_variants pv
      join products p on p.id = pv.product_id
      where pv.id = inventory_cache.variant_id
        and pv.status = 'published'
        and p.status = 'published'
    )
  );
