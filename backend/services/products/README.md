# products

**Phase:** 3

Admin product CRUD: name, description, brand, category, collection, images, SKU, barcode, size, price, discount, tags, ingredients, SEO, publish/featured state.

Status: **implemented** — see `docs/phase-3-completion-report.md` for the full writeup.

## Implementation
- Service layer: `products.service.ts` (create/update/publish/unpublish/archive product, add/update/archive variant, add/reorder/remove image, set primary image, signed image-upload URLs).
- Validation: `backend/lib/validation` (createProductSchema, updateProductSchema, productVariantInputSchema, productImageInputSchema, reorderImagesSchema, imageUploadRequestSchema).
- Pure business rules (unit tested, no DB needed): `backend/lib/catalog` (draft-safety publish gate, discount %, default badge), `backend/lib/media` (MIME/size validation, storage path rules), `backend/lib/slug` (unique slug generation).
- Edge Function (admin-only write path): `supabase/functions/products/index.ts`, authorized via `supabase/functions/_shared/adminAuth.ts` (profiles.is_admin, added in Phase 1's `0014_row_level_security.sql`).
- Public read path (published products): `src/repositories/products.repository.ts`, direct-to-Supabase via anon key + RLS.
- Storefront wiring: `src/hooks/useCatalog.js` + `src/data/catalogAdapter.ts`.

## Deferred to Phase 12
Admin CRUD **UI** (a real dashboard) is out of scope for Phase 3 — this phase ships the service/repository/Edge Function layer only, per the spec.
