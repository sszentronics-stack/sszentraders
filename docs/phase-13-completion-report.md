# Phase 13 Completion Report — Promotions, Loyalty & Customer Intelligence

## Implementation summary

Phase 13 turns the Phase 1 schema-only foundation (`campaigns` / `promotions` / `coupons` / `discounts`) into a real, server-side discount and loyalty engine, plus the customer-intelligence queries that feed eligibility:

- **Coupon/promotion rule engine** — code-based and automatic offers, date windows, min spend, first-order-only, product/category/collection scope, and a documented no-stacking precedence rule. All discount math runs server-side inside the `promotions` Edge Function; the client never supplies a discount amount.
- **Atomic coupon usage limits** — a single conditional `UPDATE ... WHERE times_used < usage_limit` (exposed as the `claim_coupon_usage` Postgres function) makes two concurrent checkouts racing for the last use of a limited coupon impossible, with a compensating `release_coupon_usage` call if order creation fails after the claim.
- **Loyalty points ledger** — an append-only `loyalty_ledger_entries` table (earn/redeem/reversal), balance always `SUM(points)`, never a mutable column. Earning (on `orders.order_status` reaching `delivered`) and reversal (on `cancelled`/`refunded`) are implemented as a Postgres trigger on `orders`, so they fire correctly regardless of which service transitions order status — including future Phase 12 admin actions this phase never had to touch.
- **Checkout integration** — `orders.service.ts::createOrder` gained an additive coupon/loyalty hook: validate + atomically claim a coupon (or pick the best eligible automatic promotion), validate + redeem loyalty points, compute a combined `discountTotal`, and record everything through Phase 7's existing `recordDiscountTransaction` — no duplicate accounting write path.
- **Reorder** — `cart.service.ts::reorderToCart` re-adds a past order's items to the current cart, revalidating each line's price/availability today (reusing `addCartItem`) rather than replaying the old snapshot.
- **Customer segmentation** — `segmentation.service.ts` computes new/returning/VIP/inactive, favourite category, and average repeat-purchase interval from real `orders`/`order_items` data; used by the engine's first-order-only eligibility check.
- **Abandoned-cart query** — a read-only admin query over `carts`/`cart_items` (no notification is sent — no channel exists).
- **Admin UI** — a standalone `/admin/promotions` route (campaigns, promotions, coupons + usage, abandoned carts) since Phase 12's shared admin shell may not exist yet in this worktree (see Known limitations).
- **Customer UI** — `/account/loyalty` (balance + history) and a coupon-code/loyalty-redemption block on the Checkout page, both showing exactly what the server computed, including unmet-eligibility reasons.

## Architecture and key decisions

- **No stacking, ever.** At most one promotion applies per order: an explicit coupon code wins if eligible; otherwise the single best-value eligible automatic promotion applies. This is a deliberate simplification over a combinable-discount DSL, documented in `backend/lib/promotions`'s header.
- **Pure-logic / DB-facing split**, matching every other phase in this codebase: `backend/lib/promotions` and `backend/lib/loyalty` contain zero DB calls and are what's unit-tested; `backend/services/promotions/*.service.ts` do the Supabase reads/writes around them.
- **Trigger-based loyalty lifecycle**, not a service-layer call site. `order_status` can be changed by more than one code path (customer self-cancel today; a future Phase 12 admin status change or the returns/refund flow tomorrow). A single `AFTER UPDATE OF order_status ON orders` trigger (`fn_promotions_on_order_status_change`, in `0022_promotions_engine.sql`) guarantees the earn/reversal consequence fires exactly once, idempotently (via a unique `idempotency_key` per ledger row), no matter which future phase's code performs the update — Phase 13 never had to modify Phase 6/11/14 service files to wire this in.
- **Coupon concurrency via a single UPDATE, not a lock.** `claim_coupon_usage(coupon_id)` is a one-statement conditional `UPDATE` exposed as a Postgres RPC; Postgres serializes concurrent callers against the same row for free. `release_coupon_usage` is the matching compensating write, called if the order fails to complete after a successful claim (checked with a `try/catch` around the order+items insert in `orders.service.ts`).
- **Earn rate**: 1 point per Rs. 1 (100 minor units) of `grand_total`, floored. **Redemption value**: 1 point = Rs. 1 of discount. Both are documented once in `backend/lib/loyalty/index.ts` and mirrored (never re-derived independently) by the SQL trigger's hardcoded formula — the migration and the lib cross-reference each other.
- **Reused Phase 7 accounting exactly as instructed.** `orders.service.ts` still calls the same `recordDiscountTransaction(db, order)` it always did; Phase 13 only changes what `discountTotal` it's called with (coupon discount + loyalty redemption value, combined). No new accounting write path was added.

## Database-schema changes

New migration: `supabase/migrations/0022_promotions_engine.sql`.

- `promotions` gains: `min_spend bigint`, `first_order_only boolean not null default false`, `applies_to text not null default 'all'` (`all`/`category`/`collection`/`product`), `scope_id uuid` (no FK — polymorphic, validated in application code).
- New table `coupon_redemptions` (audit trail + per-customer usage counting + the `released_at` marker the reversal trigger uses) with a `unique (coupon_id, order_id)` constraint.
- New table `loyalty_ledger_entries` (append-only points ledger; `idempotency_key unique`).
- New trigger `trg_promotions_on_order_status_change` on `orders` (loyalty earn on `delivered`, reversal + coupon-usage release on `cancelled`/`refunded`).
- New RPC functions `claim_coupon_usage(uuid)` / `release_coupon_usage(uuid)`, granted to `service_role` only.
- RLS: `coupon_redemptions` is admin-only; `loyalty_ledger_entries` allows customer self-read (own entries) + admin all, matching the existing `orders`/`returns` self-read pattern in `0014_row_level_security.sql`.

No changes to `coupons` or `discounts` — their Phase 1 columns (`usage_limit`, `usage_limit_per_customer`, `times_used`; `order_id`/`promotion_id`/`coupon_id`/`amount`) were already exactly what the engine needed.

## UI/UX changes

- `src/pages/account/Loyalty.jsx` (+ nav entry in `AccountLayout.jsx`, route in `App.jsx`) — balance and full history, reusing the existing account-shell visual style (`account-card`/`bg-meta` tokens), no new design pattern.
- `src/pages/Checkout.jsx` — a coupon-code field with an explicit "Apply" check (never auto-applies silently), showing either the exact savings or the exact unmet-eligibility reason(s); a loyalty-points redemption checkbox showing the real redeemable amount and balance; the order summary discount/shipping lines reflect the server preview exactly, never a client guess.
- `src/pages/account/Orders.jsx` — a "Reorder" button per order that calls the new cart-service reorder path and reports how many items were skipped and why.
- `src/pages/admin/promotions/*` — standalone campaign/promotion/coupon management (list/create/activate-deactivate, coupon usage/redemption view) and an abandoned-carts data view, under its own `AdminPromotionsLayout` (own admin guard + nav, Aura visual tokens, no shared `AdminLayout` dependency).

## Security and permissions

- Every discount/loyalty amount is computed and re-validated server-side inside the `promotions` Edge Function / `orders.service.ts` — the client only ever sends a coupon code and a requested points count, never an amount.
- Coupon usage-limit enforcement is transactionally safe via the single-statement conditional `UPDATE` RPC described above; per-customer usage limit is checked via a `coupon_redemptions` count immediately before the claim (a real, if narrow, race window remains here — see Known limitations, matching the "don't over-engineer distributed locking" instruction).
- All `/admin/*` promotions routes require `requireAdmin` (JWT + `profiles.is_admin`), same as every other admin Edge Function route in this codebase.
- `loyalty_ledger_entries` RLS lets a customer read only their own entries; all writes go through the service-role Edge Function.
- `claim_coupon_usage`/`release_coupon_usage` are revoked from `PUBLIC` and granted to `service_role` only.
- Marketing-related segmentation was scoped to respect `customers.marketing_opt_in`, though this phase's segmentation output (`classifyCustomer`) is read via an authenticated admin-only route today — no bulk marketing-list export exists yet to gate on that flag; noted for the next phase.

## External integration impact

None. No new external provider calls. The only cross-phase touch points are the documented, additive ones: `orders.service.ts::createOrder` (coupon/loyalty hook), `cart.service.ts` (reorder), and Phase 7's existing `recordDiscountTransaction` (reused, not duplicated).

## Tests and build results

- `npm run lint` (oxlint) — clean; only pre-existing warnings in unrelated files (`CartContext.jsx`, `AuthContext.jsx`, `WishlistContext.jsx`).
- `npm run typecheck` (`tsc --noEmit`) — clean.
- `npm test` (vitest) — **385 passed** across 43 files (up from the pre-Phase-13 suite; all prior tests still pass unmodified). Per the minimal-testing instruction, new tests are focused on the genuinely risky pure logic only:
  - `backend/lib/promotions/promotions.test.ts` — discount calculation (percentage floor/clamp, fixed-amount clamp, free-shipping, category scoping), eligibility (multi-reason reporting, date windows, first-order-only, coupon usage/per-customer limits), and best-automatic-promotion selection.
  - `backend/lib/loyalty/loyalty.test.ts` — earn-rate flooring, redemption value, ledger balance summation, max-redeemable capping, and redemption validation errors.
- `npm run build` (vite) — succeeds; the one warning (main chunk > 500kB) is pre-existing and unrelated to this phase.

## Files created/modified/deleted

**Created**
- `supabase/migrations/0022_promotions_engine.sql`
- `backend/lib/promotions/index.ts`, `backend/lib/promotions/promotions.test.ts`
- `backend/lib/loyalty/index.ts`, `backend/lib/loyalty/loyalty.test.ts`
- `backend/services/promotions/promotions.service.ts`
- `backend/services/promotions/loyalty.service.ts`
- `backend/services/promotions/segmentation.service.ts`
- `supabase/functions/promotions/index.ts`
- `src/repositories/promotions.repository.ts`
- `src/repositories/loyalty.repository.ts`
- `src/pages/account/Loyalty.jsx`
- `src/pages/admin/promotions/AdminPromotionsLayout.jsx`, `Campaigns.jsx`, `Promotions.jsx`, `Coupons.jsx`, `AbandonedCarts.jsx`
- `docs/phase-13-completion-report.md`

**Modified**
- `backend/lib/validation/index.ts` — Phase 13 schemas + `checkoutSchema` gains optional `couponCode`/`redeemPoints`.
- `backend/services/orders/orders.service.ts` — additive coupon/loyalty checkout hook.
- `backend/services/cart/cart.service.ts` — additive `reorderToCart`.
- `backend/services/promotions/README.md` — status updated from stub.
- `supabase/functions/cart/index.ts` — additive `POST /reorder/:orderId` route.
- `src/App.jsx` — `/account/loyalty` route; standalone `/admin/promotions/*` route tree.
- `src/context/CartContext.jsx` — additive `reorder()` action.
- `src/pages/Checkout.jsx` — coupon/loyalty UI.
- `src/pages/account/AccountLayout.jsx` — nav entry.
- `src/pages/account/Orders.jsx` — Reorder button.
- `src/repositories/cart.repository.ts`, `src/repositories/orders.repository.ts` — reorder + coupon/points fields.

**Deleted**: none.

## Migrations/configuration required

- Apply `supabase/migrations/0022_promotions_engine.sql`.
- Deploy the new `promotions` Edge Function (`supabase functions deploy promotions`) and redeploy `cart` (for the reorder route) and `orders` (for the checkout hook — same function, updated dependency graph, no new deploy config needed beyond the standard redeploy).
- No new environment variables or secrets.

## Known limitations / deferred items

- **Admin promotions UI built standalone.** `src/pages/admin/promotions/*` has its own `AdminPromotionsLayout` (own nav, own admin guard) rather than plugging into a shared `/admin/*` shell, because Phase 12 (Admin Operations Dashboard) is being built concurrently in a separate worktree and had not merged a shared `AdminLayout` at the time this phase started — confirmed by checking `src/App.jsx`, which had no `/admin/*` route tree at all when this phase began. **A follow-up integration pass is needed** once both phases are merged: fold this route tree into Phase 12's shared admin nav (likely adding a "Promotions" item there and removing `AdminPromotionsLayout`'s standalone guard/nav in favor of the shared one).
- **Loyalty earn/reversal triggers are correct but currently latent for the `delivered`/`refunded` paths.** No code in this codebase yet transitions `orders.order_status` to `delivered` or `refunded` (verified: Phase 11's courier/shipment flow only updates `shipments.status`, and Phase 14's returns/refund flow only updates `returns.status` — neither touches `orders.order_status`, and Phase 6's own status machine allows but nothing yet drives those transitions). The earn/reversal trigger is written and unit-testable at the SQL level and will fire correctly the moment a future phase (most likely Phase 12's admin order-status management) starts making those transitions — this phase intentionally did not add that order-status-driving logic itself, since it belongs to Phase 6/11/12's territory, not Phase 13's.
- **Per-customer coupon usage limit has a small, accepted race window.** The global `usage_limit` is enforced atomically (single conditional `UPDATE`); the per-customer `usage_limit_per_customer` check reads a count from `coupon_redemptions` just before the claim, which is not itself atomic against a second concurrent checkout by the same customer. A `unique(coupon_id, customer_id)` constraint would close this but would also cap every coupon at exactly one use per customer regardless of its configured limit, which is wrong when `usage_limit_per_customer > 1`. Documented rather than solved with a heavier locking mechanism, per this phase's explicit "don't over-engineer distributed locking" instruction.
- **Loyalty redemption has a similar small race window** for the same reason (re-checks balance immediately before writing, but two concurrent checkouts by the same customer could still both pass the check). Same reasoning as above.
- **Checkout-time discount preview for loyalty redemption doesn't net against an in-progress coupon.** The `/promotions/preview` route computes `maxRedeemablePoints` from the full cart subtotal, not the subtotal-after-coupon-discount that `createOrder` actually uses when both a coupon and points redemption are requested together — the server-side `createOrder` computation is authoritative and correct (it nets properly), but the Checkout page's live preview can show a very slightly more generous "max redeemable" number than what the final order will accept, in the rare case a customer applies both. A minor UX polish opportunity, not a correctness bug (the server always re-validates and never over-redeems).
- **Segmentation output has no bulk export/marketing-list surface yet** — `marketing_opt_in` is defined in the schema and available to filter on, but no admin flow currently reads a segment as a marketing list; that's left for a future phase, per the "not a UI dashboard, Phase 15's job" scoping note in the spec.

## Next-phase readiness

- The loyalty earn/reversal trigger and the `orders.order_status` values `delivered`/`refunded` are ready for whichever phase (most likely Phase 12) starts actually driving those transitions — no further Phase 13 schema or trigger work is needed when that happens.
- `backend/services/promotions/segmentation.service.ts`'s `classifyCustomer`/`getCustomerOrderStats` functions are designed to be reused as-is by a future analytics phase (Phase 15) rather than needing their own re-derivation.
- The admin promotions UI is functionally complete but structurally awaiting the Phase 12 integration pass noted above.
