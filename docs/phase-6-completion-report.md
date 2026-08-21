# Phase 6 Completion Report — Checkout & Order Management

## Implementation summary

Phase 6 replaces WhatsApp as the order system with a first-class website checkout and order lifecycle, while keeping WhatsApp as an optional "contact support about this order" channel — exactly as scoped. It builds entirely on Phase 5's server-side cart (`getCartSummary()`) as the sole source of truth for what's being ordered, so "recalculate every price/discount server-side at final order creation" falls out of reuse rather than a second implementation.

Delivered:
- **Multi-step checkout** (`/checkout`): contact → shipping address (with saved-address picker for signed-in customers) → delivery method → payment method → review → place order, with a visible step-progress indicator and an always-visible order summary sidebar. Server-computed totals throughout; "no surprise charges after final review" is literal — the review step shows exactly what `createOrder()` will charge.
- **Guest and authenticated checkout**, both using Phase 5's guest-identity mechanism (Supabase anonymous auth → `profiles.id`) — no separate guest code path.
- **Idempotent order creation**: the client generates one `X-Idempotency-Key` per checkout attempt and reuses it on any retry; the server (`backend/lib/idempotency`, already scaffolded in Phase 1) detects a duplicate submit and replays the original order instead of creating a second one.
- **Collision-resistant, human-friendly order numbers** (`AURA-YYYYMMDD-XXXXXX`), immutable order/order-item snapshots (name, SKU, variant, price at time of order — never re-joined from the live catalog later).
- **COD as a real payment method** with `pending`/COD semantics; Easypaisa is selectable and recorded as `pending` payment, but no live gateway call is made — exactly per the "do not fake payment success" instruction (real Easypaisa integration is Phase 10).
- **Order status/payment status/fulfillment status** stay independent columns with a status-history timeline, using Phase 1's already-built, already-unit-tested `assertOrderStatusTransition` guard rather than a new state machine.
- **Order confirmation page** (`/order-confirmation/:id`) and **My Account → Orders** (list + reused detail view), plus **customer-initiated cancellation** (pending/confirmed orders only).
- **Guest order lookup** (order number + email) for a guest returning in a different browser session where their original anonymous session no longer applies.
- **WhatsApp repositioned**: Cart/Product pages now show "Proceed to checkout" / "Ask a question on WhatsApp" instead of building a WhatsApp order message, when Supabase is configured. When it isn't (this dev environment), the original WhatsApp-order flow is preserved byte-for-byte, per the "do not break existing working customer flow" rule.

## Architecture and key decisions

- **Order items are derived exclusively from the server-side cart, never from client-supplied line items.** Phase 1's placeholder `createOrderSchema` accepted a client `items` array; Phase 6 supersedes it with a new `checkoutSchema` that carries no items at all — `orders.service.ts`'s `createOrder()` calls `cart.service.ts`'s `getCartSummary()` (Phase 5, already revalidates every line against live `product_variants`) as its only source of items/prices. If that same revalidation pass just dropped a stale line, checkout is blocked with "please review your cart" rather than silently proceeding with a smaller order — the stronger of the two design options the spec allowed for stale-cart handling.
- **Guest identity is Phase 5's anonymous-auth mechanism, not a new one.** `backend/services/orders/orders.service.ts` resolves/creates the checkout's `customers` row via `ensureCustomerForProfile` (Phase 2's dedup-safe linking logic, `backend/lib/auth/linking.ts` — unchanged), fed by a newly-shared `backend/services/auth/auth.service.ts` (`makeCustomerLinkDeps`, factored out of `supabase/functions/auth/index.ts`'s previously-local, unexported copy so Phase 6 doesn't fork a second "does a customer exist for this profile/email/phone" implementation — `auth/index.ts` itself now imports and uses the shared version, a pure extraction with identical behavior).
- **Guest order access relies on RLS + profile linkage, not a bespoke access token.** Because a guest's `customers` row is linked to their anonymous `profiles.id` (same as an authenticated customer's), the existing `orders_self_read` RLS policy (`0014_row_level_security.sql`, unchanged) already scopes order reads correctly for both — no new column or token table was needed for the common "confirm my own just-placed order" case. The one gap this doesn't cover — a guest returning in a *different* browser session, where their original anonymous JWT is gone — is handled by the separate `POST /orders/lookup` (order number + exact email match); order numbers are non-sequential/non-guessable, satisfying "do not expose orders by sequential ID" without inventing an email-magic-link system the spec didn't ask for.
- **Idempotency is handled entirely in the Edge Function**, not the service layer: `orders.service.ts`'s `createOrder()` has no idempotency awareness of its own, keeping it a plain "do the thing" function; `supabase/functions/orders/index.ts` wraps it with `backend/lib/idempotency`'s `decideIdempotency()` (already unit-tested in Phase 1) — proceed / replay / reject-conflict / wait-for-in-flight — storing `response_reference` = the created order id on success, and marking the key `failed` (safe to retry) if `createOrder()` throws.
- **Delivery pricing is a deliberately simple flat-rate table** (`backend/lib/orders`'s `deliveryCost()`), not a rate engine — there is no live courier integration until Phase 11 (Leopards), so inventing dynamic pricing now would just be a number nobody asked for. Both the checkout UI and `orders.service.ts` import the exact same function, so client-displayed and server-charged shipping cost can never drift.
- **Shipping address is snapshotted as columns directly on `orders`** (`0018_order_address_snapshot.sql`), mirroring `order_items`' existing snapshot philosophy, rather than a separate `order_addresses` table — a single order has exactly one shipping address, so a join buys nothing.
- **Cart → order handoff**: once an order is created, the cart that produced it is flipped to `status = 'converted'` (`cart.service.ts`'s new `markCartConverted()`, called from `orders.service.ts`) rather than deleted — so `cart_events` history survives and `getOrCreateActiveCart()` naturally starts a fresh cart on the visitor's next visit. This needed one small, backward-compatible schema change: `cart_events`'s `event_type` check constraint (0017) didn't anticipate this outcome, so `0018` extends it with a `'converted'` value alongside the seven already shipped, rather than overloading `'merged'` (which means something semantically different — a guest cart's lines merging into an authenticated cart).

## Database/schema changes

One new migration: `supabase/migrations/0018_order_address_snapshot.sql`.
- Adds `shipping_recipient_name`, `shipping_phone`, `shipping_address_line_1`, `shipping_address_line_2`, `shipping_city`, `shipping_province`, `shipping_postal_code`, `shipping_country`, `delivery_method`, `customer_address_id` to `orders`.
- Extends `cart_events.event_type`'s check constraint to add `'converted'` (see above).

No changes to `orders`/`order_items`/`payments`/`order_status_history` (0006/0007) — Phase 1's schema for these was already sufficient; Phase 6 only needed the address snapshot addition.

## UI/UX changes

- New `/checkout` page: step progress indicator, sectioned steps (not a full page-per-step — keeps state simple and avoids losing form input on browser back/forward), saved-address picker for signed-in customers, delivery/payment option cards, and a persistent order-summary sidebar — all built from existing `form-field`/`form-input`/`form-error`/`btn-lavender`/`btn-outline` classes already established by Phase 2's account forms. No new design system introduced.
- New `/order-confirmation/:id` (and reused at `/account/orders/:id`): order number, status, items, totals, shipping address, a "Contact us about this order" WhatsApp link (order-number-scoped, not order-placing), and a cancel button when the order is still cancellable.
- New `/account/orders`: replaces the Phase 1 "Coming soon" placeholder with a real order list (reusing the `address-card`/`address-badge` classes from the existing Addresses page for visual consistency).
- `Cart.jsx`/`CartDrawer.jsx`/`Product.jsx`: dual-mode exactly like every prior phase's context work — "Proceed to checkout" / "Ask a question on WhatsApp" when Supabase is configured, the original WhatsApp-order UI unchanged otherwise.

## Security and permissions

- Every order route requires a valid Supabase Auth JWT (anonymous or signed-in), resolved via the same `_shared/callerAuth.ts` Phase 5 introduced — never trusts a client-asserted profile/customer id.
- `getOrderForCaller()` always throws a generic `NotFoundError` for "exists but isn't yours" — never a distinguishable 403 — so the endpoint can't be used to confirm another customer's order exists by probing ids.
- Every price/total is computed server-side from the live cart at order-creation time; the client's checkout form supplies no price, only what it wants (address, delivery method, payment method) — matching "do not trust browser payment status or order totals."
- Guest order lookup requires an exact order-number + email match (not rate-limited in this environment — flagged below).
- Cancellation is gated by `assertOrderStatusTransition` (only `pending`/`confirmed` → `cancelled`) — an order already `shipped`/`delivered`/etc. cannot be self-cancelled.
- No secrets logged; audit entries (`order.created`, `order.cancellation_requested`) carry only order id/number/totals/item counts.

## External integration impact

None beyond what was already scoped: Easypaisa is selectable at checkout and recorded as a `pending` payment row, but `EasypaisaProvider` is never called — live gateway integration remains Phase 10's job. LedGix ERP and Leopards Courier are untouched.

## Tests and build results

Run from the repo root:
```
npm run typecheck   # tsc --noEmit — 0 errors
npm run lint         # oxlint — 4 pre-existing/expected warnings (see Phase 5 report), 0 errors
npm run test         # vitest run — 146 passed (146), 20 test files
npm run build         # vite build — succeeds, dist/ produced
```
New test file: `backend/lib/orders/orders.test.ts` (8 tests — order number generation/collision-retry, order-item snapshot building, delivery cost lookup).

Also covered by a manual Playwright smoke test (no Supabase configured, so the fallback/graceful-degradation paths are what's exercised): adding to cart, viewing the (WhatsApp) cart page, directly hitting `/checkout` (correctly redirects to `/cart` since Supabase isn't configured), `/order-confirmation/:id` (shows a friendly "not available right now" message, not an internal error string), and the auth-gated `/account/orders` (shows the pre-existing "Accounts are not available yet" message via `ProtectedRoute`) — zero JS `pageerror`s across all of them. This smoke test caught and led to fixing a real bug before commit: `OrderConfirmation`/`Orders`/`Checkout` were initially leaking the raw `MissingEnvVarError` message ("Copy .env.example to .env.local...") into the rendered page when Supabase isn't configured; all three now check `isSupabaseConfigured()` up front and show a generic, user-safe message instead, while still surfacing real server-side error messages (which are already vetted for end-user display via `backend/lib/errors`) once Supabase-backed calls are actually reachable.

**Not tested against a live database**: `orders.service.ts`, the `orders` Edge Function, and therefore the full checkout → idempotency → order-creation → cancellation flow end-to-end, plus the guest-anonymous-auth checkout path specifically. Same documented limitation as every prior phase — no live Supabase project exists in this environment.

## Files created/modified/deleted

**Created:**
- `supabase/migrations/0018_order_address_snapshot.sql`
- `backend/lib/orders/index.ts`, `backend/lib/orders/orders.test.ts`
- `backend/services/auth/auth.service.ts` (shared customer-link deps, extracted from `auth/index.ts`)
- `backend/services/orders/orders.service.ts`
- `src/repositories/orders.repository.ts`
- `src/pages/Checkout.jsx`, `src/pages/OrderConfirmation.jsx`, `src/pages/account/Orders.jsx`

**Modified:**
- `backend/lib/validation/index.ts` (checkout/guest-lookup/cancel Zod schemas)
- `backend/services/cart/cart.service.ts` (`markCartConverted`)
- `backend/services/orders/README.md` (status: not started → implemented)
- `supabase/functions/auth/index.ts` (now imports the shared `makeCustomerLinkDeps` instead of a local copy)
- `supabase/functions/orders/index.ts` (rewritten: create/read/list/cancel/lookup, replacing the Phase 1 validate-and-501 stub)
- `src/lib/supabase/functions.ts` (`callEdgeFunction` now supports a `headers` option, for `X-Idempotency-Key`)
- `src/App.jsx` (routes: `/checkout`, `/order-confirmation/:id`, `/account/orders`, `/account/orders/:id`)
- `src/pages/Cart.jsx`, `src/components/CartDrawer.jsx`, `src/pages/Product.jsx` (WhatsApp repositioned as support-only when Supabase is configured; unchanged otherwise)

**Deleted:** none.

## Migrations/configuration required

- Run `supabase/migrations/0018_order_address_snapshot.sql` against the target Supabase project (after `0017_cart_wishlist_recently_viewed.sql`).
- Deploy the updated `orders` and `auth` Edge Functions (`supabase functions deploy orders auth`).
- No new environment variables.
- Same anonymous-auth prerequisite Phase 5 already flagged: "Allow anonymous sign-ins" must be enabled for guest checkout to work at all.

## Known limitations/deferred items

- **No integration tests against a live Supabase project** — none exists in this environment (documented above and consistently across every prior phase).
- **Guest order lookup (`/orders/lookup`) has no rate limiting** in this environment — worth adding (e.g. a per-IP/time-window check) once real hosting/observability exists to build one against; the order-number + exact-email-match requirement is the primary defense in the meantime.
- **Delivery pricing is a flat rate**, not a real courier rate table — intentionally deferred to Phase 11.
- **No coupon/discount application at checkout** — `discount_total` stays 0; Phase 13's job.
- **Checkout has no explicit "save this address" checkbox for guests-turned-customers** — a signed-in customer can pick a saved address, but a new address entered at checkout isn't offered as "save for next time"; low priority relative to the core checkout flow for this pass.
- **Admin-side cancellation/administration hooks are minimal** — `requestOrderCancellation` supports the customer-initiated path the spec asked for; a fuller admin cancellation/refund workflow is Phase 12's job.

## Next-phase readiness

Phase 6 is complete per spec: guest and authenticated checkout, idempotent order creation, independent order/payment/fulfillment status with a transition-guarded timeline, COD as a real payment method, Easypaisa selectable but not live, and WhatsApp repositioned as support-only — all on top of Phase 5's cart with no re-derivation of its revalidation logic. Tests/lint/typecheck/build are green, and a runtime smoke test (which caught and fixed one real error-message-leak bug before commit) confirms the existing storefront theme/behavior is unbroken. Phase 7 (Local Operational Accounting Layer) has a clean `orders`/`payments` write path to hang its local financial-event recording off of; Phase 10 (Easypaisa) has a `payment_method`-aware order + a `payments` row already sitting `pending`, ready for a real `EasypaisaProvider` implementation to update rather than create from scratch.
