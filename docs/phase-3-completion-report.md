# Phase 3 Completion Report — Product Management & Dynamic Product Display Engine

## Implementation summary

Phase 3 builds the admin-driven product catalog write path and the storefront's read path on top of the Phase 1 schema/RLS/storage foundation, and converts the previously hard-coded `src/data/products.js` storefront to be backend-driven while preserving its exact theme, URLs, and behavior.

Delivered:
- **Admin write layer** (service + Edge Function, per the spec's instruction to prioritize this over admin UI): create/update/publish/unpublish/archive for products, variants/SKUs, and image galleries; create/update/publish/unpublish/archive for brands, categories, and collections.
- **Draft safety**: a product cannot move to `published` unless it has at least one published variant and at least one image.
- **Slug/SKU uniqueness**: a clean candidate slug is generated up front (`base`, `base-2`, `base-3`, ...); the database's unique index remains the source of truth, and a unique-violation is caught and re-thrown as a clean `ConflictError`.
- **Image management**: signed upload URLs (server-issued, admin-only, MIME/size validated), metadata recording, reordering (`sort_order`), primary-image selection (`is_primary`), removal with best-effort storage cleanup.
- **Public catalogue query engine**: by slug, by category, by brand, by collection (respecting campaign windows), featured, new, on-sale, and related products — all in `src/repositories/`, all field-scoped selects (never leak `cost_price`/`ledgix_item_id`).
- **Storefront conversion**: `src/hooks/useCatalog.js` + `src/data/catalogAdapter.ts` load products from Supabase when configured, with an automatic, silent fallback to the original static dataset otherwise or on error — the storefront never crashes and never hangs on an infinite spinner.
- **No admin dashboard UI was built.** Per the spec, that's Phase 12; this phase intentionally spent its effort on the service/repository/Edge Function layer.

## Architecture and key decisions

- **Stack correction applied throughout**: no Next.js/API routes anywhere. Privileged writes are Supabase Edge Functions (Deno); public reads are direct Supabase calls from the Vite SPA through `src/repositories/`, gated by RLS.
- **Admin authorization already existed.** Phase 1's `0014_row_level_security.sql` already added `profiles.is_admin` and the `is_admin()` SQL function. Phase 3 does **not** add a new role column — it only *consumes* the existing one, via a new shared helper `supabase/functions/_shared/adminAuth.ts` (factored out of the duplicated JWT-verify + `is_admin` lookup that was inline in the Phase 1 `products/index.ts` stub, now reused by both `products` and the new `catalog` Edge Function). **This satisfies the "add a minimal role concept" instruction by discovering it was already delivered in Phase 1** — flagged explicitly here for Phase 2/12 awareness: no `profiles` schema change was needed or made in Phase 3, so there is nothing for Phase 2's parallel Customer Auth work to conflict with on this front.
- **Business rules are pure and unit-tested independently of any database**: `backend/lib/catalog` (discount %, campaign-window check, publish-readiness gate, default badge), `backend/lib/media` (MIME/size validation, deterministic storage paths), `backend/lib/slug` (slugify + unique-candidate generation). The actual DB-touching service functions (`backend/services/products/products.service.ts`, `backend/services/catalog/catalog.service.ts`) are thin wrappers around these rules plus direct Supabase calls, following the same "runtime-agnostic core + thin I/O shell" pattern Phase 1 established in `backend/lib`.
- **No live Supabase project exists in this environment.** The DB-touching service functions and Edge Functions could not be exercised against a real database. What *is* tested (86 passing tests) is every pure business rule, every validation schema path, the field-scoped select's redaction guarantee, and the storefront adapter's data mapping. This is flagged as a known limitation below, not glossed over.
- **`products.attributes` (new jsonb column, isolated migration).** The existing schema had no columns for the marketing copy the current storefront renders (highlights, benefits, how-to-use steps, an explicit badge override, a details table, rating placeholders pending the future Reviews service). Rather than adding five-plus narrow columns, one `attributes jsonb` column was added — mirroring the exact convention `product_variants.attributes` already established in Phase 1 — validated at the service layer (`productAttributesSchema`), not the database. This is the **only** schema change in Phase 3, and it touches only the `products` table.
- **Query strategy: fetch-then-filter in application code**, not exotic PostgREST nested-filter syntax, for `listFeaturedProducts`/`listNewProducts`/`listOnSaleProducts`/`listProductsByCategorySlug`/`listProductsByBrandSlug`/`listProductsByCollectionSlug`/`listRelatedProducts`. Given there is no live project to iteratively verify PostgREST relation-filter syntax against, this was the more defensible choice — every function is a straightforward `.filter()`/`.sort()` over the single `listPublishedProducts()` result, easy to reason about and to correct later against a real project without touching call sites.
- **Storefront hook design (`src/hooks/useCatalog.js`) loads the full published product list once** and derives "by slug", "others", filters, etc. in memory, rather than a hook per specialized query. The catalog is small (a handful of SKUs today); this keeps every page's loading/empty/error story identical instead of a matrix of one-off hooks. `useProducts()`/`useProduct(slug)` never throw into the component tree and always resolve `loading: false`.
- **`src/hooks/useCatalog.js` and `src/data/products.js` are plain JS, not TypeScript**, deliberately: they sit on the JS side of the pre-existing Phase 1 "TypeScript for new backend/repository code, plain JS for the existing Vite frontend" boundary. `tsconfig.json`'s `allowJs: false` means a `.ts` file cannot import a `.js` module without a compile error; keeping the hook in JS avoids awkwardly bridging that boundary while still letting it freely import the (TypeScript) repository/adapter layer, which Vite handles transparently at build time regardless of the tsc boundary.

## Database-schema changes

One migration: `supabase/migrations/0016_catalog_content_attributes.sql`.
```sql
alter table products add column attributes jsonb not null default '{}'::jsonb;
```
No other schema changes. In particular:
- **No `profiles` migration.** The admin-role concept the spec asked Phase 3 to add already existed from Phase 1 (`profiles.is_admin` + `is_admin()` in `0014_row_level_security.sql`). Verified by reading that migration before starting; documented here instead of duplicated.
- No stock/inventory columns were added or touched, per the explicit "do not implement authoritative inventory editing" instruction.

## UI/UX changes

**None to visual output.** `src/components/ProductCard.jsx`, `src/components/*`, and every Tailwind class/token in `src/pages/*` are untouched. The only page-level changes are:
- `src/pages/Home.jsx`, `src/pages/Shop.jsx`, `src/pages/Product.jsx` now source their product list from `src/hooks/useCatalog.js` instead of a static import, and render a loading skeleton (simple `animate-pulse` blocks using the existing `bg-meta` token — no new visual system) and an empty/error message using the same typographic classes already in use elsewhere (`text-ink-soft`, etc.) while data loads or if a Supabase call fails and even the fallback is empty.
- Everything else (`ProductCard`, cart, checkout-via-WhatsApp, header/footer, hero slider, trust bar, disclaimer) is byte-for-byte unchanged.

## Security and permissions

- **Admin mutations require server-side role authorization.** Both Edge Functions (`products`, `catalog`) call `requireAdmin(req)` before any write, which verifies the caller's JWT via the anon-key user-scoped client (never trusts a client-asserted id) and then checks `profiles.is_admin` with the service-role client. No anon-key write path exists for any catalog table.
- **Public catalogue queries are field-scoped**, never `select *`. `src/repositories/products.repository.ts` explicitly excludes `cost_price` and `ledgix_item_id`. Guarded by `src/repositories/products.repository.test.ts`, which asserts the select string never contains those fields (or a wildcard) — a fast regression guard on top of RLS, which is the real enforcement layer (`0014_row_level_security.sql`: every catalog table's public policy is `status = 'published'` only; nothing else is exposed to `anon`).
- **Image uploads are MIME/size-validated and path-sanitized** before a signed upload URL is ever issued (`backend/lib/media`: `image/jpeg`, `image/png`, `image/webp`, `image/avif` only, 5MB max). Storage paths are built from stable IDs only (`{productId}/{variantId-or-'default'}/{imageId}.{ext}`) — never from the admin's uploaded file name — so a crafted file name can never influence the storage path or collide with/overwrite an unrelated object.
- **Audit logging**: every admin mutation in both Edge Functions writes an `audit_logs` row via the existing `backend/lib/audit` helper (actor, action, entity, minimal metadata — never secrets, enforced by that module's own guard).

## External integration impact

None. LedGix ERP, Easypaisa, and Leopards remain untouched and out of scope, as required. `product_variants.ledgix_item_id` exists in the schema (Phase 1) but is never selected or exposed by the public repository layer.

## Tests and build results

Run from the repo root:
```
npm run typecheck   # tsc --noEmit — 0 errors
npm run lint         # oxlint — 1 pre-existing warning (CartContext.jsx fast-refresh), unrelated to Phase 3
npm run test         # vitest run — 86 passed (86), 13 test files
npm run build         # vite build — succeeds, dist/ produced
```
New test files added this phase:
- `backend/lib/slug/slug.test.ts`
- `backend/lib/media/media.test.ts`
- `backend/lib/catalog/catalog.test.ts`
- `src/repositories/products.repository.test.ts` (public-payload redaction guard)
- `src/data/catalogAdapter.test.ts` (DB-shape -> storefront-shape mapping, price conversion, badge computation, image URL building)

**Not tested against a live database**: the actual Supabase-calling code in `backend/services/products/products.service.ts`, `backend/services/catalog/catalog.service.ts`, and both Edge Functions. There is no live Supabase project in this environment. Every piece of *business logic* those files call into (draft-safety, discount math, slug generation, MIME/size validation) is unit tested in isolation; the I/O shell around it is not integration-tested. This should be the first thing verified once a real Supabase project is linked (see Next-phase readiness).

## Files created/modified/deleted

**Created:**
- `supabase/migrations/0016_catalog_content_attributes.sql`
- `backend/lib/slug/index.ts`, `backend/lib/slug/slug.test.ts`
- `backend/lib/media/index.ts`, `backend/lib/media/media.test.ts`
- `backend/lib/catalog/index.ts`, `backend/lib/catalog/catalog.test.ts`
- `backend/services/products/products.service.ts`
- `backend/services/catalog/catalog.service.ts`
- `supabase/functions/_shared/adminAuth.ts`
- `supabase/functions/catalog/index.ts`
- `src/repositories/collections.repository.ts`
- `src/repositories/products.repository.test.ts`
- `src/lib/supabase/storage.ts`
- `src/data/catalogAdapter.ts`, `src/data/catalogAdapter.test.ts`
- `src/hooks/useCatalog.js`
- `docs/phase-3-completion-report.md` (this file)

**Modified:**
- `backend/lib/types/domain.ts` (extended `Product` with `attributes`/`ingredients`/`directions`/`productType`/`seoTitle`/`seoDescription`/`publishedAt`; added `Collection`)
- `backend/lib/validation/index.ts` (extensive new schemas: update/status/image/reorder/upload/brand/category/collection)
- `backend/services/products/README.md`, `backend/services/catalog/README.md` (status updated from "not started")
- `supabase/functions/products/index.ts` (rewritten as a small admin router: create/update/publish/unpublish/archive, variants, images, signed upload URLs)
- `src/repositories/products.repository.ts` (relation joins, `attributes` passthrough, new query functions, redaction-test export)
- `src/data/products.js` (unchanged exports; header comment clarifies its new role as the offline fallback dataset)
- `src/pages/Home.jsx`, `src/pages/Shop.jsx`, `src/pages/Product.jsx` (source data via `useCatalog`, add loading/empty/error states)
- `apps/web/README.md` (status note)
- `tsconfig.json` (added `backend/services/**/*.ts` to `include` so the new service layer is typechecked)

**Deleted:** none.

## Migrations/configuration required

- Run `supabase/migrations/0016_catalog_content_attributes.sql` against the target Supabase project (in migration order, after `0015`).
- No new environment variables. Everything needed (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) already exists in `.env.example` from Phase 1.
- To actually use the admin write path once a project exists: set at least one `profiles.is_admin = true` row for the admin's Supabase Auth user (no seed data ships for this — deliberately, per Phase 1's "no invented credentials" stance).
- Deploy `supabase/functions/products` and `supabase/functions/catalog` (`supabase functions deploy products catalog`) once a project is linked.

## Known limitations/deferred items

- **No admin dashboard UI.** Explicitly deferred to Phase 12, per spec instruction to prioritize the service/repository/Edge Function layer.
- **No integration tests against a live Supabase project** — none exists in this environment. Pure logic is unit tested; the Supabase-calling shell is not.
- **Image-primary-selection and `is_primary` unset-then-set is not atomic** (two sequential calls over the JS client, not a single Postgres transaction/RPC). Documented in `products.service.ts`; low risk in practice (single-admin workflow) but worth a Postgres function if concurrent admin editing becomes a real scenario later.
- **No periodic storage-orphan-cleanup job.** `removeProductImage` deletes the metadata row and best-effort deletes the corresponding storage object; there's no reconciliation job to catch objects orphaned by a crashed upload flow (e.g. signed URL issued but the client never finished the PUT). Acceptable for now since object storage is cheap and nothing depends on bucket contents being exhaustively clean; flagged for a future Phase 9-adjacent cleanup job once there's a live project to run one against.
- **Rating/review count are placeholder-only** (`attributes.rating`/`attributes.reviewCount`, no backing table). The Reviews service (`backend/services/reviews/README.md`) is out of scope for Phase 3.
- **`listProductsByCategorySlug`/`ByBrandSlug`/`ByCollectionSlug`/related-products all fetch-then-filter client-side** rather than pushing the filter into the SQL query. Fine at current catalog scale; worth revisiting (proper PostgREST relation filters, or Postgres views/RPCs) once there's a live project to validate the query syntax against and the catalog grows large enough for it to matter.
- **Category-cycle validation is shallow** (`updateCategory` only rejects `parentId === categoryId`, not a longer cycle through several ancestors). The existing DB constraint only prevents the immediate self-reference case too; a full cycle check would need a recursive query, deferred as low-priority given categories are admin-authored, not user input.

## Next-phase readiness

Phase 3 is complete per spec: the admin write layer, public read/query layer, and storefront conversion (with graceful no-Supabase fallback) are all in place, tests/lint/typecheck/build are green, and the storefront's visual output and behavior (cart, WhatsApp checkout, navigation) are unchanged. **Ready for Phase 4** (or whichever phase consumes this catalog next), with two things worth flagging to whoever picks up work next:
1. **Phase 2 (Customer Auth, parallel)**: no `profiles` schema changes were made in Phase 3 — nothing to reconcile there.
2. **Phase 12 (Admin Dashboard)**: the service/Edge Function layer (`products`, `catalog`) is ready to be called from a real admin UI; no further backend work should be needed to build that UI beyond wiring HTTP calls to the two Edge Functions documented above.
