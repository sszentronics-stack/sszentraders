-- 0016_catalog_content_attributes.sql
-- Phase 3: Product Management & Dynamic Product Display Engine.
--
-- Adds a single flexible `attributes` jsonb column to `products`, mirroring
-- the convention already established on `product_variants.attributes`
-- (0005_products_variants_images.sql). This holds the small set of
-- storefront copy items the existing Aura frontend renders that don't
-- warrant their own dedicated column (marketing highlights, key benefits,
-- how-to-use steps, an explicit badge override, a product-details table,
-- and optional rating/reviewCount placeholders pending the future Reviews
-- service). The shape is validated at the application layer
-- (backend/lib/validation's productAttributesSchema), not the database —
-- consistent with how product_variants.attributes is handled.
--
-- Documented soft shape:
--   {
--     "tagline": string, "subtitle": string,
--     "badge": "new" | "sale" | "bestseller",
--     "highlights": string[], "benefits": string[], "howToUse": string[],
--     "details": [string, string][],
--     "rating": number, "reviewCount": number
--   }
--
-- Scope note: this migration touches ONLY the `products` table. It is
-- intentionally isolated from `profiles` (owned in parallel by the Phase 2
-- Customer Auth workstream) to avoid migration-ordering conflicts between
-- worktrees. Phase 3 does NOT need a profiles change — the `is_admin`
-- boolean + `is_admin()` helper this phase's admin authorization relies on
-- already shipped in 0014_row_level_security.sql.

alter table products add column attributes jsonb not null default '{}'::jsonb;

comment on column products.attributes is 'Admin-authored storefront copy not covered by a dedicated column (highlights, benefits, how-to-use, badge override, details table, rating placeholders). Validated by backend/lib/validation productAttributesSchema, not by the database.';
