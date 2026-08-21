# catalog

**Phase:** 3

Read-side product display engine: category/brand/collection listings, featured/sale sections, search, related products. Powers dynamic product cards/pages on the storefront with no developer intervention needed after publish. Also owns admin write access for brands/hierarchical categories/collections.

Status: **implemented** — see `docs/phase-3-completion-report.md` for the full writeup.

## Implementation
- Admin write service: `catalog.service.ts` (create/update/publish/unpublish/archive for brands, categories, collections).
- Edge Function (admin-only): `supabase/functions/catalog/index.ts`.
- Read path (published, RLS-scoped): `src/repositories/brands.repository.ts`, `src/repositories/categories.repository.ts`, `src/repositories/collections.repository.ts` (new in Phase 3).
- Query engine used by the storefront: `src/repositories/products.repository.ts` — `listFeaturedProducts`, `listNewProducts`, `listOnSaleProducts`, `listProductsByCategorySlug`, `listProductsByBrandSlug`, `listProductsByCollectionSlug`, `listRelatedProducts`.
