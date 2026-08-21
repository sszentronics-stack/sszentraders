# promotions

**Phase:** 13

Coupons, discount rules, campaigns, first-order/free-shipping offers, bundles, loyalty points, customer segmentation, favourite categories, repeat-purchase analysis, reorder, abandoned carts.

Status: **done**. See `docs/phase-13-completion-report.md` for the full writeup.

## Files
- `backend/lib/promotions/index.ts` — pure eligibility/discount-amount rules.
- `backend/lib/loyalty/index.ts` — pure points earn/redeem/balance arithmetic.
- `backend/services/promotions/promotions.service.ts` — DB-facing coupon/promotion engine, admin CRUD, atomic coupon-usage claim/release.
- `backend/services/promotions/loyalty.service.ts` — DB-facing ledger reads + checkout-time redemption write.
- `backend/services/promotions/segmentation.service.ts` — customer segment/abandoned-cart queries.
- `supabase/functions/promotions/index.ts` — the Edge Function (preview, loyalty, admin routes).
- `supabase/migrations/0022_promotions_engine.sql` — schema extensions, `coupon_redemptions`, `loyalty_ledger_entries`, the order-status trigger, and the `claim_coupon_usage`/`release_coupon_usage` RPCs.

## Phase 1 foundation (superseded)
- Schema only, no engine: `supabase/migrations/0010_promotions.sql` (`campaigns`, `promotions`, `coupons`, `discounts`) — extended, not replaced, by 0022.
