# supabase/migrations

Ordered, reproducible SQL migrations for the Aura Beauty Care schema
(Phase 1). Applied in filename order (`0001_...` before `0002_...`, etc.) —
never edit an already-applied migration; add a new one instead.

## Files

| File | Contents |
|---|---|
| `0001_extensions_and_enums.sql` | Extensions (`pgcrypto`, `citext`), all status ENUM types, money/status convention comments, `set_updated_at()` trigger helper. |
| `0002_profiles_customers.sql` | `profiles` (1:1 with `auth.users`), `customers`. |
| `0003_customer_addresses.sql` | `customer_addresses` (Pakistani-shaped, country-agnostic). |
| `0004_catalog_brands_categories_collections.sql` | `brands`, `categories` (hierarchical), `collections`. |
| `0005_products_variants_images.sql` | `products`, `product_variants`, `product_images`, `product_categories`, `product_collections`. |
| `0006_orders.sql` | `orders`, `order_items` (price/name snapshotted), `order_status_history`. |
| `0007_payments.sql` | `payments`, `payment_events` — model only, no live Easypaisa calls. |
| `0008_shipments.sql` | `shipments`, `shipment_events` — model only, no live Leopards calls. |
| `0009_returns.sql` | `returns`, `return_items`, `return_events` — schema only. |
| `0010_promotions.sql` | `campaigns`, `promotions`, `coupons`, `discounts` — schema only, no engine. |
| `0011_accounting_erp_sync.sql` | `local_financial_transactions`, `erp_sync_jobs`, `erp_sync_events`. |
| `0012_inventory_cache.sql` | `inventory_cache` — synced copy only, LedGix ERP is sole authority. |
| `0013_idempotency_and_audit.sql` | `idempotency_keys`, `audit_logs`. |
| `0014_row_level_security.sql` | Enables RLS + policies on every table above, `is_admin()` / `current_profile_id()` helpers. |
| `0015_storage_buckets.sql` | `product-images`, `brand-assets`, `category-assets` buckets + storage policies. |
| `0016_address_default_enforcement.sql` | Phase 2: trigger that atomically clears a customer's previous default shipping/billing address when a new one is promoted, so the "one default per customer" partial unique indexes never block a legitimate change. |
| `0017_cart_wishlist_recently_viewed.sql` | Phase 5: `cart_items`, `wishlist_items`, `recently_viewed_products`. |
| `0018_order_address_snapshot.sql` | Phase 6: snapshotted shipping/billing address columns on `orders`. |
| `0019_accounting_local_financial_events.sql` | Phase 7: local operational accounting event log feeding `local_financial_transactions`. |
| `0020_accounting_adjustment_type.sql` | Phase 8 housekeeping: adds `'adjustment'` to `local_financial_transactions`' `transaction_type` check constraint, needed by the Phase 10/11 → Phase 7 accounting consolidation's `recordAdjustmentTransaction()`. |
| `0021_inventory_cache_public_read.sql` | Phase 9: extends `inventory_cache` RLS with a public-read policy (storefront stock-availability badges), separate from the admin-only write path. |
| `0022_promotions_engine.sql` | Phase 13: promotions/coupon evaluation engine tables. |
| `0023_catalog_content_attributes.sql` | Phase 3: adds `products.attributes` jsonb (storefront copy — highlights, benefits, how-to-use, badge override, details table, rating placeholders). |
| `0024_reviews_and_returns_workflow.sql` | Phase 14: new `product_reviews`/`product_review_images` (verified-purchase reviews); `returns`/`return_items` gain workflow columns (`resolution`, `refund_method`, `reason_code`, LedGix credit-note reference, etc.); new `return_item_evidence`; `review-images` (public) and `return-evidence` (private) storage buckets + RLS. |
| `0025_leopards_shipments.sql` | Phase 11: `shipment_status` enum gains `pending_booking`/`rto_initiated`/`rto_in_transit`/`rto_delivered`; `shipments` gains `purpose`, `return_id`, `request_payload`, `booking_error`, `booking_attempted_at`, `idempotency_key`, and duplicate-booking-prevention indexes. |

**Renumbering history:** three pairs of migrations were originally written
sharing a numeric prefix — merged from parallel sibling-agent phases off the
same `main` commit without renumbering (`0016`×2, `0019`×2, `0021`×2). This
was believed safe because each pair touches fully disjoint tables, so
applying either file first is harmless *content-wise*. It is **not** safe
mechanically: the Supabase CLI's `supabase_migrations.schema_migrations`
tracking table keys each applied migration by its numeric prefix alone
(not the full filename), so pushing a second file sharing an already-applied
prefix fails with `duplicate key value violates unique constraint
"schema_migrations_pkey"` — caught on the first real `supabase db push`
against a live project. Fixed by renumbering the second file in each pair
to the next free number after the highest existing migration, preserving
file content and relative apply order (verified no later migration
foreign-keys or otherwise depends on the renumbered files running earlier
in the sequence): `0016_catalog_content_attributes.sql` → `0023`,
`0021_reviews_and_returns_workflow.sql` → `0024`,
`0019_leopards_shipments.sql` → `0025`. The first file in each pair kept
its original number since — where a push had already progressed that far
— it may already be recorded in a live project's migration history.

`../seed.sql` holds minimal, clearly-marked, safe-to-rerun DEV-ONLY seed data
(3 brands, 3 categories, 1 product/variant matching the current live
storefront data) — it is picked up automatically by `supabase db reset` /
`supabase start`, never by `supabase db push`.

## How to apply

No live Supabase project credentials exist in this environment — these
migrations have been written and reviewed but not run against a real
database yet. Once a project exists:

```bash
# Local development (requires Docker + the Supabase CLI):
supabase init          # if not already initialized
supabase link --project-ref <your-project-ref>
supabase start          # local Postgres + seed.sql
supabase db push        # applies supabase/migrations/*.sql to the linked project

# Or, with no CLI/Docker available: open the Supabase Dashboard's SQL editor
# for your project and run each file in this folder in numeric order.
```

To regenerate TypeScript types from the live schema once a project exists:

```bash
supabase gen types typescript --linked > backend/lib/types/database.generated.ts
```

(Not run here — `backend/lib/types/domain.ts` documents that it is
hand-written for exactly this reason.)
