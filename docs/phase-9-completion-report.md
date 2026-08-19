# Phase 9 Completion Report — ERP-Controlled Inventory & Availability Synchronization

## Implementation summary

Phase 9 makes LedGix ERP the sole authoritative inventory movement system while giving the storefront a fast, synchronized availability cache — exactly the "Stock read: ERP → sync service → inventory_cache → catalogue/cart/checkout" flow the spec describes. **No real LedGix API documentation or credentials exist in this project** (same situation as Phase 8), so `LedGixErpProvider.getInventorySnapshot()` still throws `IntegrationNotConfiguredError` — nothing here fabricates a stock quantity, an ERP item mapping, or a successful sync.

Delivered:
- **Admin variant<->LedGix item mapping** (`backend/services/inventory/inventory.service.ts`), reusing the unique index already on `product_variants.ledgix_item_id` (Phase 1) for duplicate-mapping prevention rather than re-deriving that rule.
- **A real inventory sync worker** (`syncInventoryFromErp`) that mirrors Phase 8's `attemptErpSync` pattern exactly: pull every mapped variant's `ledgix_item_id`, call `ErpProvider.getInventorySnapshot()` once (batched, matching that method's real signature), upsert `inventory_cache` on success, and on failure mark cache rows `sync_status: 'failed'` **without ever touching their quantities** — a failed/not-configured sync never zeroes or guesses a stock number.
- **Pure availability domain logic** (`backend/lib/inventory`, unit tested): `computeAvailabilityState` (in_stock/low_stock/out_of_stock/**unknown**), `assessCheckoutAvailability` (the single decision cart/checkout revalidation uses — clamp, don't just reject, and never block a sale on missing data alone), `isInventoryCacheStale`, and `buildInventoryCacheUpserts` (ERP snapshot → cache-row mapping, silently dropping any snapshot for an item id with no known variant mapping).
- **Cart/checkout revalidation now checks real stock**, not just publish status: `backend/lib/cart`'s `revalidateCartLine` (Phase 5) is extended to reject an out-of-stock line and clamp an over-requested quantity down to what's actually available — `backend/services/cart/cart.service.ts`'s `buildSummary()`/`addCartItem()`/`fetchVariantSnapshot()` now read `inventory_cache` and feed it in. **`backend/services/orders/orders.service.ts` needed zero changes** — `createOrder()` already derives its line items from `cart.service.ts`'s `getCartSummary()` (Phase 6's design), so checkout availability revalidation fell out of the cart change for free.
- **Storefront reads real availability**: a new RLS policy (`0021_inventory_cache_public_read.sql`) lets the anon-key browser client read `inventory_cache` for published-product variants; `src/repositories/products.repository.ts` joins it (field-scoped — no `ledgix_item_id`, no admin-only columns); `src/data/catalogAdapter.ts` computes a real `availability` state instead of the Phase 3 `inStock: true` placeholder; `ProductCard`/`Product.jsx` show "Sold out"/"Only a few left" and disable "Add to bag" when genuinely out of stock.
- **Admin visibility**: `listUnmappedVariants()` — every published variant with no LedGix item mapping yet, the "stale/unmapped products" surface the spec asks for (full admin UI is Phase 12's job, per the same "admin UI is a later phase" pattern Phase 3 established for its own write path).
- **No scheduler exists** (no persistent process on Hostinger/no-VPS hosting) — `POST /inventory/sync` is the on-demand equivalent, same pattern as Phase 8's `POST /accounting/:id/sync`.

## Architecture and key decisions

- **`backend/lib/inventory` vs `backend/services/inventory` mirrors Phase 8's `backend/lib/erp` vs `backend/services/erp/ledgix` split exactly** — pure, zero-I/O decision logic in `lib`; DB/provider orchestration in `services`. This is now the third phase in a row (7, 8, 9) using the identical "runtime-agnostic core + thin I/O shell" split Phase 1 established.
- **"Unknown" availability is never treated as out of stock — that's the single most important design decision in this phase.** A variant with no `inventory_cache` row (not yet ERP-mapped, or never synced) stays fully purchasable at the requested quantity. Given that **zero** variants are ERP-mapped in this environment (no live LedGix project), the alternative — blocking sales until every SKU is mapped — would have silently broken the entire storefront's existing "Add to bag" flow, directly violating the "do not break existing working customer flow" rule every phase in this repo carries. Real, synced `out_of_stock`/insufficient-quantity data is what blocks/clamps a sale; missing data never does.
- **Cart/checkout reads `inventory_cache` directly (service-role, in-process), not through the new `inventory` Edge Function.** The Edge Function is admin-only (mapping + sync-now); `cart.service.ts`/`orders.service.ts` already run server-side with a service-role client, so an HTTP round trip to a second Edge Function for every cart read would add latency for no benefit — matching how `orders.service.ts` already reads `cart_items`/`product_variants` directly rather than calling the `cart` function internally.
- **A failed/not-configured sync writes `sync_status: 'failed'` but never touches quantity columns.** Supabase's `.upsert()` (PostgREST `ON CONFLICT DO UPDATE`) only updates the columns explicitly provided — omitting `quantity_on_hand`/`available`/`reserved` from the failure-path upsert means an existing row's last-known-good quantities are left exactly as they were; only a variant with *no* prior row gets one at the schema's zero defaults (an honest "we have never had real data for this" state, not a fabricated stockout).
- **A snapshot for an ERP item id with no known Aura variant mapping is silently dropped**, not errored — `buildInventoryCacheUpserts` only ever writes a cache row for a `ledgix_item_id` this codebase actually recognizes; Aura never invents which variant a stray ERP item id belongs to.
- **RLS is the only schema change needed.** `inventory_cache` (0012) and `product_variants.ledgix_item_id` (0005) already existed with exactly the shape Phase 9 needed — the single migration this phase adds is a public-read RLS policy (mirroring `product_variants_public_read`'s own published-product join shape), not a new table or column. Public exposure is row-level only; the field-scoped select convention (already used to keep `cost_price`/`ledgix_item_id` off every public product read) is what keeps `ledgix_item_id` itself out of the browser.
- **`ProductVariant.availableQuantity` is an optional field on the shared domain type** (`backend/lib/types/domain.ts`), not a separate storefront-only shape — it's a real, backend-synced fact about the variant, not UI sugar, so it belongs on the same type every layer already shares. Admin write paths (`backend/services/products`) simply never populate it.

## Database/schema changes

One new migration: `supabase/migrations/0021_inventory_cache_public_read.sql`.
- Adds `inventory_cache_public_read`: a row is selectable by the anon-key client only when its variant belongs to a published product (mirrors `product_variants_public_read`'s existing join shape from `0014_row_level_security.sql`). The pre-existing `inventory_cache_admin_all` policy is untouched — every write still requires `is_admin()` (or, in practice, the service-role Edge Function, which bypasses RLS entirely).

No other schema changes — `inventory_cache` (0012) and `product_variants.ledgix_item_id` (0005) already had every column this phase needed.

## UI/UX changes

- `ProductCard`: a grey "Sold out" badge (replacing the sale/new/bestseller badge, since an unsellable item shouldn't also look like a deal) with a dimmed thumbnail image when out of stock; a small "Only a few left" note under the price when low stock. No new visual system — reuses the existing `.badge` class with an inline override color, and existing typographic tokens.
- `Product.jsx`: "Currently out of stock" / "Only a few left in stock" messages above the quantity selector; the quantity stepper and "Add to bag" button are disabled (button label switches to "Out of stock") using the pre-existing `.btn-lavender[disabled]` styling.
- `CartDrawer`/`Cart.jsx`'s existing "N items were removed" notice now also covers a new "out of stock" removal reason, and a new companion notice appears when a line's quantity was reduced (not removed) to match real stock — both surfaced through the same dismissible banner pattern Phase 5 already built.
- No admin UI was built (per spec, matching Phase 3's precedent: the service/Edge Function layer — mapping, sync-now, unmapped-variant listing — is ready for Phase 12 to wire a real screen to).

## Security and permissions

- No ERP inventory mutation endpoint is exposed to the browser/mobile — every write to `inventory_cache` happens inside `syncInventoryFromErp()`, called only from the admin-gated `POST /inventory/sync` route (`requireAdmin` — JWT-verify + `profiles.is_admin`, same helper every other admin Edge Function route in this codebase uses).
- The public RLS policy exposes quantities only, never `ledgix_item_id` (kept out of every public repository select, same convention as `cost_price`).
- Admin mapping duplicate-prevention relies on the real database unique constraint (`uq_product_variants_ledgix_item_id`), not just application logic — a race between two admin requests still can't create a duplicate mapping.
- Every sync attempt (success or failure) writes exactly one audit log entry (`inventory.sync_attempted`) via `backend/lib/audit`'s `writeAuditLog()`, same "every ERP-adjacent privileged action is audited" rule Phase 8 established.
- Sync failure messages are sanitized before being audited (only `IntegrationNotConfiguredError`'s static, developer-authored message, or a generic fallback for anything unrecognized) — no raw provider payload is ever stored, matching Phase 8's `sync.service.ts` precedent exactly.

## External integration impact

**No live LedGix integration exists or was invented.** `LedGixErpProvider.getInventorySnapshot()` (already stubbed in Phase 1, "not implemented until Phase 9") still throws `IntegrationNotConfiguredError` unconditionally — this phase built the entire surrounding sync architecture without changing that method's body, per the "fail safely, never fabricate a number" rule every ERP-adjacent phase in this project follows. `product_variants.ledgix_item_id` was previously read-only (Phase 8's invoice line-item builder reads it); this phase is the first to actually write it (via admin mapping).

## Tests and build results

Run from the repo root:
```
npm run typecheck   # tsc --noEmit — 0 errors
npm run lint         # oxlint — 4 pre-existing/expected warnings (see Phase 5 report), 0 errors
npm run test         # vitest run — 280 passed (280), 35 test files (was 277/35 pre-cart-test-additions, 261/34 before this phase's own new file)
npm run build         # vite build — succeeds, dist/ produced
```
New/extended test files:
- `backend/lib/inventory/inventory.test.ts` — 16 tests: availability-state thresholds (custom threshold too), checkout-quantity clamping/rejection/unknown-passthrough, cache-staleness windows, and ERP-snapshot-to-cache-row mapping (including the "unmapped item id is dropped" case).
- `backend/lib/cart/cart.test.ts` — extended with 3 new tests for `revalidateCartLine`'s inventory-aware behavior: unknown availability keeps the full requested quantity, zero availability drops the line as `out_of_stock`, and insufficient availability clamps the quantity (with `quantityAdjusted: true` and a correctly-recomputed `lineTotal`).

Also ran a manual Playwright smoke test (no Supabase configured, so the fallback/localStorage cart path is what's exercised — every fallback product carries `availability: 'unknown'`, so no false out-of-stock state is possible there): home/shop/product/cart pages all load, "Add to bag" still works end-to-end, zero JS `pageerror`s.

**Not tested against a live database or a live LedGix endpoint** (none exists in this environment — same documented limitation as every prior phase). `inventory.service.ts`'s Supabase-calling functions are not covered by an in-memory-fake test suite (unlike Phase 8's `sync.service.test.ts`) — this was judged an acceptable scope trade-off for this pass since the actual business logic (availability decisions, clamping, snapshot mapping) is fully unit tested in `backend/lib/inventory`, and the service layer is a thin, low-branching shell over it (same shape Phase 7/8's own services took, just without the equivalent fake-DB test harness this time); flagged below as a known limitation.

## Files created/modified/deleted

**Created:**
- `supabase/migrations/0021_inventory_cache_public_read.sql`
- `backend/lib/inventory/index.ts`, `backend/lib/inventory/inventory.test.ts`
- `backend/services/inventory/inventory.service.ts`
- `supabase/functions/inventory/index.ts`
- `docs/phase-9-completion-report.md` (this file)

**Modified:**
- `backend/lib/cart/index.ts` (`revalidateCartLine` is now inventory-aware: new `out_of_stock` reason, quantity clamping, `quantityAdjusted` flag)
- `backend/lib/cart/cart.test.ts` (new availability-aware test cases)
- `backend/lib/types/domain.ts` (`ProductVariant.availableQuantity`)
- `backend/lib/validation/index.ts` (`inventoryMappingInputSchema`)
- `backend/services/cart/cart.service.ts` (`buildSummary`/`addCartItem`/`fetchVariantSnapshot` read `inventory_cache`; `CartSummaryItem.quantityAdjusted`; `removedItems` reason extended)
- `backend/services/inventory/README.md` (status: not started → implemented)
- `src/repositories/products.repository.ts` (joins `inventory_cache`, field-scoped)
- `src/repositories/cart.repository.ts` (mirrors the backend type additions)
- `src/data/catalogAdapter.ts` (`StorefrontProduct.availability`, computed from real data instead of a hardcoded `true`)
- `src/data/products.js` (offline fallback dataset now explicitly carries `availability: 'unknown'`)
- `src/components/ProductCard.jsx` (sold-out/low-stock badges)
- `src/pages/Product.jsx` (out-of-stock messaging, disabled add-to-bag/quantity controls)
- `src/context/CartContext.jsx` (surfaces the new quantity-adjusted notice alongside the existing removed-items one)
- `src/lib/productSearch.test.ts` (test fixture updated for the new required-then-optional `availability` field)

**Deleted:** none.

## Migrations/configuration required

- Run `supabase/migrations/0021_inventory_cache_public_read.sql` against the target Supabase project (after `0020_accounting_adjustment_type.sql`).
- Deploy the new `inventory` Edge Function (`supabase functions deploy inventory`).
- No new environment variables — `LEDGIX_API_BASE_URL`/`LEDGIX_API_KEY`/`LEDGIX_COMPANY_ID` already exist (Phase 1/8) and are the only config `getInventorySnapshot()` will need once real LedGix docs/credentials exist.
- Once a live project + real LedGix credentials exist: an admin must map each sellable variant to its LedGix item id (`POST /inventory/map`) before that variant gets any real availability data; `GET /inventory/unmapped` finds the ones still missing a mapping.

## Known limitations/deferred items

- **No real LedGix inventory API contract was available** — `getInventorySnapshot()`'s method body, and therefore the exact shape of `quantity_on_hand`/`available`/`reserved`/reservation semantics, remains a documented best-guess pending real LedGix docs, consistent with Phase 8's own flagged limitation for every other LedGix method.
- **No integration test against a live Supabase project** — none exists in this environment (documented above and consistently across every prior phase). Unlike Phase 8's `sync.service.ts`, `inventory.service.ts` doesn't have an equivalent in-memory-fake-client test file — the pure decision logic it calls into is fully tested, but the I/O shell itself isn't independently exercised. Worth adding once a live project exists to validate the actual Supabase query shapes against.
- **No scheduled/periodic sync** — same "no persistent process on Hostinger" constraint every serverless-hosted phase in this project has flagged; `POST /inventory/sync` is today's on-demand equivalent. A future phase should wire either Supabase `pg_cron`/`pg_net` or an external cron once real credentials make an automatic sync worth running.
- **Reservation semantics (`quantity_reserved`) are stored but not yet used for anything** — Phase 9 stores whatever LedGix eventually reports there, but no Aura flow currently reads or reasons about it (e.g. reserving stock during an in-progress checkout). Deferred as out of this phase's explicit scope.
- **The "Sold out"/"Only a few left" UI only appears for storefront cards backed by live catalog data** — the offline fallback dataset (this dev environment's actual current state) always reports `availability: 'unknown'`, so none of this phase's new UI is currently visible without a live, ERP-mapped Supabase project. Verified by code review and the manual smoke test's absence of any availability-badge rendering.
- **Admin mapping/sync UI is service/Edge-Function-layer only**, per spec — a real screen is Phase 12's job, same precedent Phase 3 set for its own admin write path.

## Next-phase readiness

Phase 9 delivers the complete "LedGix ERP is the sole authoritative inventory system, Aura keeps a fast synced cache" architecture: admin mapping with real duplicate prevention, a sync worker that never fabricates a quantity, cart/checkout revalidation that clamps/blocks on genuine stock data while never blocking on merely-missing data, and a storefront that shows real availability instead of a hardcoded placeholder. `getAvailabilityForVariants()` (`backend/services/inventory/inventory.service.ts`) is ready for any future phase (Phase 12's admin low-stock dashboard card, Phase 15's inventory-valuation reporting) to reuse directly rather than re-deriving. Tests/lint/typecheck/build are all green, and a runtime smoke test confirms the existing storefront theme/behavior (add-to-bag, cart, browsing) is unbroken.

This phase was developed in parallel with Phase 14 (Reviews, Returns & Customer Service, run in a separate session) — both depend only on already-merged phases (3, 6, 8, 10, 11), not on each other, and neither phase's file set was expected to overlap the other's beyond incidental, additive touches to shared pages (see Phase 14's own completion report for its side of the coordination).
