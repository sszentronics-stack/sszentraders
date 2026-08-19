# products

**Phase:** 3

Admin product CRUD: name, description, brand, category, collection, images, SKU, barcode, size, price, discount, tags, ingredients, SEO, publish/featured state.

Status: not started (Phase 1 laid the foundation below).

## Phase 1 foundation
- Schema: `supabase/migrations/0005_products_variants_images.sql`, `0004_catalog_brands_categories_collections.sql`.
- Public read path (published products): `src/repositories/products.repository.ts`, direct-to-Supabase via anon key + RLS — no Edge Function needed for reads.
- Privileged write path (admin create): `supabase/functions/products/index.ts`.
- Full admin CRUD UI is Phase 3, not Phase 1.
