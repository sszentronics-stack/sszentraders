# Phase 5 Completion Report — Persistent Cart, Wishlist & Shopping State

## Implementation summary

Phase 5 replaces the client-only, price-trusting `CartContext` (localStorage, Phase 1 era) with a server-backed cart, wishlist, and recently-viewed system that works identically for guests and signed-in customers, while keeping the exact existing fallback behavior when Supabase isn't configured (this dev environment — see docs/phase-3-completion-report.md).

Delivered:
- **Guest + authenticated identity, unified.** A guest is a Supabase anonymous-auth session (`supabase.auth.signInAnonymously`, scaffolded in Phase 2's `AuthContext.ensureGuestSession` but never called until now) that resolves to a real `profiles.id` exactly like a signed-in customer does. Cart/wishlist/recently-viewed rows all hang off `profiles.id` — there is no separate "guest token" identity system.
- **Server-computed cart**, never a client-trusted total: every add/update/remove/merge/read revalidates each line against the live `product_variants` row and returns a fresh subtotal. A line whose variant/product has gone unavailable is dropped automatically and reported back (`removedItems`), surfaced in the UI as a dismissible notice.
- **Deterministic guest → customer cart merge** at login/registration: the browser captures its held cart lines just before the session swaps identity, then calls `POST /cart/merge` once the new (authenticated) session is active; quantities for the same variant are summed, never duplicated.
- **Wishlist**: save/remove, revalidated at read time (a product that's gone unpublished since being saved is quietly dropped rather than shown broken).
- **Recently viewed**: capped at 12 per profile ("privacy-conscious limits" per spec), trimmed server-side on every write.
- **Abandoned-cart foundation**: an append-only `cart_events` table records create/item_added/item_updated/item_removed/cleared/merged events — nothing acts on it yet (no campaigns sent), exactly as scoped.

## Architecture and key decisions

- **Ownership model reuses `profiles.id`, not a new identity concept.** This was the single biggest design decision: rather than inventing a guest-session-token table, Phase 5 leans on Phase 2's already-scaffolded anonymous-auth mechanism. `supabase/functions/_shared/callerAuth.ts` is a new shared helper (same JWT-verify + `profiles` upsert as `auth/index.ts`'s local version, but also accepting anonymous sessions) used only by the new `cart` function — `auth/index.ts` itself is untouched, since it also needs the full profile-detail columns its own routes serve and forking that would have meant either widening its select unnecessarily or introducing a second shape; not worth the churn on Phase 2's already-merged code for this pass.
- **Pure domain logic lives in `backend/lib/cart`** (merge math, price/availability revalidation, subtotal computation, recently-viewed trimming) — zero I/O, fully unit tested (17 tests), same "runtime-agnostic core + thin I/O shell" pattern Phase 1/3 established. The Supabase-touching shells (`backend/services/cart/*.service.ts`) are not integration-tested, for the same reason Phase 3 documented: **no live Supabase project exists in this environment.**
- **One Edge Function (`cart`), not three.** Cart, wishlist, and recently-viewed all need the same caller resolution and are small enough individually that three separate functions would mean three copies of route-prefix stripping and caller resolution for no real isolation benefit. Routing follows the exact manual-switch-on-segments pattern `products/index.ts` established in Phase 3.
- **`cart_items.unit_price_snapshot` is informational only.** It exists so a "your price changed since you added this" notice is possible, but `cart.service.ts`'s `buildSummary()` always re-reads the live `product_variants.price` and is the only source of the number the client ever sees — the snapshot is never itself returned as the authoritative price.
- **Frontend contexts are dual-mode**, exactly matching `useCatalog.js`'s Phase 3 precedent: `CartContext` and the new `WishlistContext` use the server-backed path when `isSupabaseConfigured()`, and fall back to the original localStorage behavior otherwise — so the storefront's behavior in this no-live-project dev environment is unchanged from before Phase 5 except for the new wishlist heart icon (which also degrades to localStorage).
- **Merge-on-login is client-orchestrated, not server-side identity linking.** Supabase Auth gives an anonymous session and a real login session different `auth.uid()`s, so there's no way for the server to know "this new session used to be that old anonymous one" on its own. `CartContext` instead captures its currently-held lines in a ref, detects the anonymous → authenticated transition via `session.user.id`/`is_anonymous` changes, and POSTs the snapshot to `/cart/merge` once the new session is live. The server never trusts the snapshot's prices — only variant ids and quantities — and re-validates everything before merging.

## Database/schema changes

One new migration: `supabase/migrations/0017_cart_wishlist_recently_viewed.sql`.
- `carts` (one active cart per profile — enforced by a partial unique index on `profile_id where status = 'active'`), `cart_items`, `cart_events`.
- `wishlist_items`, `recently_viewed`.
- RLS: self-read (`profile_id = current_profile_id()`, reusing Phase 1's `current_profile_id()` function) + admin-all on every table, no direct client write policies — matching the `orders`/`payments` posture in `0014_row_level_security.sql`. Every write goes through the `cart` Edge Function's service-role client, which re-validates ownership/price/availability first.

**Note (not introduced by this phase, flagged for awareness):** the repository already has two migrations both numbered `0016` — `0016_address_default_enforcement.sql` (Phase 2) and `0016_catalog_content_attributes.sql` (Phase 3), both already merged to `main` before this phase started. Filename sort still applies them in a deterministic, non-conflicting order, so nothing here is broken by it, but a future phase doing schema work should renumber going forward from `0017` (this migration) rather than reusing `0016` again.

## UI/UX changes

- **Cart**: unchanged visual design (`CartDrawer`, `Cart.jsx` markup/classes untouched) — only the data source changed, plus a new dismissible "N items were removed" notice when a stale line is dropped during revalidation.
- **New**: a heart-toggle wishlist button on every `ProductCard` and the product detail page's add-to-bag row, using the existing badge/border/shadow visual language (no new design system introduced).
- **New**: `/account/wishlist` now renders a real product grid (replacing the Phase 1 "Coming soon" placeholder) using the same `product-card`/`thumb`/`price-*` classes as the Shop grid.
- Loading states for cart/wishlist reuse the existing `animate-pulse` skeleton pattern from Phase 3's catalog loading states.

## Security and permissions

- Every cart/wishlist/recently-viewed mutation requires a valid Supabase Auth JWT (anonymous or signed-in) verified via the anon-key user-scoped client — never trusts a client-asserted profile/customer id (`_shared/callerAuth.ts`).
- Ownership is re-checked server-side on every item-level mutation (`requireOwnedCartItem` in `cart.service.ts`) even though RLS already denies cross-profile reads — defense in depth, same posture as `backend/lib/auth/authorization.ts`'s existing helpers.
- **Price/total is never accepted from the client.** Every function in `backend/lib/cart` and `cart.service.ts` computes price/subtotal exclusively from a `product_variants` row fetched by the service itself in the same request.
- No secrets are logged; `cart_events.metadata` only ever carries ids/quantities/counts.

## External integration impact

None. LedGix ERP, Easypaisa, and Leopards remain untouched. `carts`/`cart_items` intentionally have no stock-decrement logic — availability is read-only against `product_variants`/`products` status, per the explicit "do not create local stock decrement logic" instruction; real inventory sync is Phase 9's job.

## Tests and build results

Run from the repo root:
```
npm run typecheck   # tsc --noEmit — 0 errors
npm run lint         # oxlint — 4 pre-existing/expected warnings (fast-refresh context-file warnings, one exhaustive-deps note on the merge-on-login effect), 0 errors
npm run test         # vitest run — 138 passed (138), 19 test files
npm run build         # vite build — succeeds, dist/ produced
```
New test file: `backend/lib/cart/cart.test.ts` (17 tests — merge math, revalidation, subtotal, recently-viewed trimming).

Also ran a manual runtime smoke test (Playwright against `vite preview`, no Supabase configured so the fallback paths are what's exercised): home/shop/search/product/cart pages all load with zero JS `pageerror`s; wishlist heart toggle, add-to-bag → cart drawer, and Shop sort/filter interactions all work end-to-end. The only console errors observed are the sandbox blocking the Google Fonts stylesheet request, unrelated to this phase's code.

**Not tested against a live database**: the Supabase-calling code in `cart.service.ts`/`wishlist.service.ts`/`recentlyViewed.service.ts` and the `cart` Edge Function itself, and therefore the guest-anonymous-auth → merge-on-login flow end-to-end. Same documented limitation as every prior phase — no live Supabase project exists in this environment. Every piece of pure business logic those files call into is unit tested in isolation.

## Files created/modified/deleted

**Created:**
- `supabase/migrations/0017_cart_wishlist_recently_viewed.sql`
- `backend/lib/cart/index.ts`, `backend/lib/cart/cart.test.ts`
- `backend/services/cart/cart.service.ts`, `wishlist.service.ts`, `recentlyViewed.service.ts`
- `supabase/functions/_shared/callerAuth.ts`
- `supabase/functions/cart/index.ts`
- `src/repositories/cart.repository.ts`, `wishlist.repository.ts`, `recentlyViewed.repository.ts`
- `src/context/WishlistContext.jsx`
- `src/pages/account/Wishlist.jsx`

**Modified:**
- `backend/lib/validation/index.ts` (cart/wishlist/recently-viewed Zod schemas)
- `backend/services/cart/README.md` (status: not started → implemented)
- `src/context/CartContext.jsx` (rewritten dual-mode: server-backed + unchanged localStorage fallback)
- `src/components/CartDrawer.jsx`, `src/pages/Cart.jsx` (removed-item notice)
- `src/components/ProductCard.jsx` (wishlist heart toggle)
- `src/data/catalogAdapter.ts` (added `variantId` to `StorefrontProduct`)
- `src/App.jsx` (added `WishlistProvider`, wired `/account/wishlist` to the real page)

**Deleted:** none.

## Migrations/configuration required

- Run `supabase/migrations/0017_cart_wishlist_recently_viewed.sql` against the target Supabase project (after `0016_catalog_content_attributes.sql`).
- **Enable "Allow anonymous sign-ins"** in the Supabase Auth dashboard — required for guest cart/wishlist to work at all (`ensureGuestSession()` will throw otherwise; the storefront catches this and simply shows an empty cart rather than crashing, but guests won't be able to add anything until this is enabled). This was already flagged as a Phase 5 prerequisite in Phase 2's completion report.
- Deploy the `cart` Edge Function (`supabase functions deploy cart`) once a project is linked.
- No new environment variables — everything needed already exists in `.env.example` from Phase 1.

## Known limitations/deferred items

- **No integration tests against a live Supabase project** — none exists in this environment (documented above and consistently across every prior phase).
- **Merge-on-login is best-effort, not exhaustively race-tested.** It relies on `CartContext` observing the `session.user.id`/`is_anonymous` transition via a `useEffect`; a very fast double-login or a page reload mid-transition could theoretically skip a merge. The server-side merge itself is idempotent (summed quantities, revalidated), so the worst case is "guest items weren't carried over," not data corruption.
- **Coupons/promotional pricing are explicitly out of scope**, deferred to Phase 13 per the spec — `cart.service.ts` has no discount-application logic.
- **No admin diagnostics UI for `cart_events`** — the table exists as the abandoned-cart foundation the spec asked for, but nothing reads it yet (Phase 12's job).
- **Wishlist "add to cart" from the wishlist page is not implemented** — the wishlist tracks a product, not a specific variant, so `/account/wishlist` currently only offers "view product" / remove; adding a variant-selection step there was judged out of scope for this pass.
- **No periodic reconciliation job** for the `cart_events`/abandoned-cart trail, same rationale as Phase 3's storage-orphan-cleanup note — nothing depends on it being exhaustively pruned yet.

## Next-phase readiness

Phase 5 is complete per spec: guest and authenticated carts, deterministic merge-on-login, wishlist, and recently-viewed are all in place; tests/lint/typecheck/build are green; a runtime smoke test confirms no regressions to the existing storefront theme/behavior. `getCartSummary()` (`backend/services/cart/cart.service.ts`) is the reusable "cart summary service for web checkout and future Flutter clients" the spec asked for, and is ready for Phase 6 (Checkout & Order Management) to call directly rather than re-deriving cart state.
