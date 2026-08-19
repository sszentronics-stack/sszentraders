# catalog

**Phase:** 3

Read-side product display engine: category/brand/collection listings, featured/sale sections, search, related products. Powers dynamic product cards/pages on the storefront with no developer intervention needed after publish.

Status: not started (Phase 1 laid the foundation below).

## Phase 1 foundation
- Schema: `supabase/migrations/0004_catalog_brands_categories_collections.sql`.
- Read path: `src/repositories/brands.repository.ts`, `src/repositories/categories.repository.ts` — thin, unwired-into-UI-yet wrappers for Phase 3/4 to build on.
