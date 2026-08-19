# Phase 15 Completion Report — ERP Reporting & Commerce Analytics

## Implementation summary

Phase 15 adds a new `/admin/reports` module to the Phase 12 admin shell with two clearly separated data sources:

1. **Commerce analytics** — real, live-computed operational numbers derived from Aura's own `orders` / `order_items` / `returns` / `carts` / `customers` / `products` tables: revenue, average order value (AOV), return rate, returning-customer rate, an order-conversion proxy, abandoned-cart count/rate, best sellers / slow movers, brand and category performance, and a customer cohort / CLV-proxy foundation.
2. **ERP financial reports** — what would be LedGix-authoritative accounting reports (revenue, receivables, receipts, refunds, inventory valuation, gross profit). No real LedGix reporting API exists in this project (`backend/lib/providers/LedGixErpProvider.ts` still throws `IntegrationNotConfiguredError` on every real call), so this section is architecture + an honest "unavailable" state only, driven by Phase 8's `getErpHealthStatus` — it never computes or fabricates a number locally.

A visible badge (`admin-source-badge-commerce` / `admin-source-badge-erp`) marks every section so the two are never visually or textually confused, per the phase's single most important rule: **local estimates are never called "ERP actuals."**

## Architecture and key decisions

- **Pure-logic / DB-facing split**, matching every other phase: `backend/lib/analytics/index.ts` contains the actual arithmetic (zero DB calls, unit-tested), and `src/repositories/admin/analytics.admin.repository.ts` does the Supabase reads and calls into that pure logic — the same split used by `backend/lib/money`, `backend/lib/erp`, and `backend/lib/loyalty`.
- **Direct RLS-scoped reads, not a new Edge Function.** Every table this phase reads (`orders`, `order_items`, `returns`, `carts`, `customers`, `products`, `product_variants`, `product_categories`, `inventory_cache`) already has an `*_admin_all` RLS policy (`0014_row_level_security.sql`, `0017_cart_wishlist_recently_viewed.sql`), and `orders.admin.repository.ts` / `customers.admin.repository.ts` already established the "direct browser-client read, RLS does the gating" pattern for admin-only aggregate reads. Phase 15 follows that pattern instead of introducing a new Deno Edge Function purely to re-expose the same RLS-gated data. No new migration or Edge Function was needed.
- **Reuse over reinvention.** Abandoned-cart data reuses Phase 13's existing `promotions/admin/abandoned-carts` endpoint (`listAbandonedCarts` in `src/repositories/promotions.repository.ts`) rather than re-querying carts. The "what counts as a real order" status vocabulary (`COMPLETED_ORDER_STATUSES` / `COUNTS_TOWARD_ORDER_HISTORY`) is now exported from `backend/services/promotions/segmentation.service.ts` (previously module-private) and reused by the new returning-customer-rate query, rather than being redefined. ERP health and reconciliation reuse the existing `getErpHealth()` / `runErpReconciliation()` calls in `accounting.admin.repository.ts` (Phase 8/12) unchanged. The Reports page links to `/admin/customers` for full per-customer detail and `/admin/erp` for the full Sync Center table, instead of duplicating either.
- **No competing accounting engine.** The ERP financial-reports section explicitly does not recompute a P&L, balance sheet, or trial balance from local order data — the phase spec forbids this, and the UI copy says so directly ("Aura does not, and will not, compute a competing profit-and-loss, balance sheet, or trial balance from local order data").
- **Honest "0 comparable records" reconciliation**, not a fabricated match. `runErpReconciliation()` already (Phase 8) returns real issues for local-succeeded/ERP-missing/mismatch cases even with no live ERP; the Reports page surfaces its issue count plus an explicit "0 comparable ERP records — no live LedGix snapshot exists yet" stat, and links to the full ERP Sync Center rather than rebuilding its table.
- **Truncation is flagged, not silently wrong.** The order-fetch queries cap at 2,000/5,000 rows (documented in the repository file); if a selected range exceeds that, the UI shows a note that counts reflect the most recent rows only rather than pretending completeness.

## Database-schema changes

None. This phase is entirely read-only reporting over existing tables; no migration was added.

One additive TypeScript change: `backend/services/promotions/segmentation.service.ts` now `export`s `COMPLETED_ORDER_STATUSES` and `COUNTS_TOWARD_ORDER_HISTORY` (previously module-private `const`s) so Phase 15 can reuse Phase 13's exact "what counts as a real order" definition instead of redefining it. No behavior change to Phase 13.

## UI/UX changes

- New route `/admin/reports` (`src/pages/admin/reports/Reports.jsx`), added to `AdminLayout`'s `NAV` array as "Reports", gated by the existing `RequireAdmin` wrapper around all of `/admin/*` — no new auth logic was written.
- **Date range filter**: preset buttons (Last 7 / 30 / 90 days) plus a custom from/to date picker, reusing the existing `.admin-toolbar`-style `form-input`/`form-select` classes and a small new `.admin-date-filter` block. All report sections re-fetch on range change.
- **Commerce Analytics** section: a stat-card grid (orders, revenue, AOV, return rate, returning-customer rate, conversion proxy, abandoned-cart count/rate), each labeled with its exact formula as a hint, under an `admin-source-badge-commerce` badge.
- **Product / brand / category performance**: four tables (best sellers, slow movers, brand performance, category performance) reusing the existing `admin-table` styling and `AdminCard`/`EmptyState`/`ErrorState`/`LoadingState` components from Phase 12's `src/components/admin/ui.jsx` — no new table component was built.
- **Customer cohort & CLV foundation**: new-customer count + average CLV-proxy stat cards, with a link to `/admin/customers` for full segmentation detail instead of listing individual customers (PII-minimization, see below).
- **ERP Financial Reports**: a table of the six expected report types (revenue, receivables, receipts, refunds, inventory valuation, gross profit), each row showing source ("LedGix ERP"), freshness, and a status pill — always "ERP not configured" today — under an `admin-source-badge-erp` badge, plus a Reconciliation card linking to the existing `/admin/erp` Sync Center.
- New CSS (in `src/index.css`): `.admin-source-badge` (+ `-commerce` / `-erp` variants), `.admin-section-intro`, `.admin-date-filter` (+ presets), `.admin-metric-note` — all built from the existing Aura admin palette/tokens already used by `.admin-pill` etc.; no new design system was introduced.
- Every section explicitly states currency (PKR) and that timestamps are stored in UTC and displayed in the browser's local time (no separate timezone-conversion layer was needed — `toLocaleDateString()` on an ISO timestamp already does this correctly).

## Security and permissions

- The entire module sits inside the existing `/admin` route tree wrapped by `RequireAdmin` (`profiles.is_admin`), identical to every other admin page — no new gating logic.
- No new RLS policies were needed; every table read already has an admin-scoped policy from Phase 1/5/8/9/13/14.
- No individual customer lists or PII are exported/displayed beyond what Phase 12's Customers module already shows — the cohort section shows only aggregate counts and links to `/admin/customers` for anything customer-specific. No raw email/phone/address data appears anywhere in this phase's new code.
- No sensitive data is cached in a public location — reports are computed on-demand per request via the authenticated admin's own Supabase session (RLS-scoped), nothing is persisted.

## External integration impact

None. `backend/lib/providers/ErpProvider.ts` / `LedGixErpProvider.ts` were not modified — no new LedGix method was invented. The ERP financial-reports section is deliberately UI-only, reading Phase 8's existing `getErpHealth()` health check and Phase 8's existing `runErpReconciliation()` — no new provider call, no new endpoint, no assumption about an API that doesn't exist.

## Tests and build results

- `npm run typecheck` — passes, no errors.
- `npm run lint` (oxlint) — passes (exit 0); pre-existing warning categories only (`react-hooks/exhaustive-deps`, `react/only-export-components`), consistent with warnings already present elsewhere in the codebase (e.g. `Dashboard.jsx`'s equivalent `useCard` hook).
- `npm run test` (vitest) — **401/401 tests pass**, including 16 new focused tests in `backend/lib/analytics/analytics.test.ts` covering the risky arithmetic per the minimal-testing instruction: AOV (average, rounding, empty-set-returns-null), return rate / abandoned-cart rate / returning-customer rate / order-conversion proxy (normal case + zero-denominator-returns-null, not NaN/Infinity), and CLV proxy (sum, empty-sums-to-zero, average, empty-average-returns-null). No tests were added for UI wiring or simple query functions, per instruction.
- `npm run build` (vite) — succeeds; pre-existing chunk-size warning (774 KB bundle) is unrelated to this phase (same warning exists on `main` before this change).

## Files created/modified/deleted

**Created:**
- `backend/lib/analytics/index.ts` — pure metric-calculation functions, each with its exact formula documented inline.
- `backend/lib/analytics/analytics.test.ts` — focused arithmetic tests.
- `src/repositories/admin/analytics.admin.repository.ts` — DB orchestration: date-range helpers, commerce overview, product/brand/category performance, customer cohort summary.
- `src/pages/admin/reports/Reports.jsx` — the Reports page (date filter + all sections).

**Modified:**
- `backend/services/promotions/segmentation.service.ts` — exported `COMPLETED_ORDER_STATUSES` / `COUNTS_TOWARD_ORDER_HISTORY` (previously private) for reuse; no behavior change.
- `src/components/admin/AdminLayout.jsx` — added "Reports" nav entry.
- `src/App.jsx` — added `/admin/reports` route.
- `src/index.css` — added Phase 15's badge/date-filter/metric-note styles.

**Deleted:** none.

## Migrations/configuration required

None. No new environment variables, no new migration to run, no new Edge Function to deploy. The module works against the existing schema and existing `accounting`/`promotions` Edge Function endpoints.

## Known limitations / deferred items

- **No real LedGix reporting API exists.** This is the load-bearing limitation of the whole phase: the "ERP Financial Reports" section is architecture and an honest unavailable-state only. It cannot show a single real revenue/receivables/inventory-valuation/gross-profit figure until a real LedGix reporting endpoint is confirmed and `LedGixErpProvider` implements it — inventing one was explicitly out of scope.
- **Reconciliation cannot compare against live ERP data.** `runErpReconciliation()` always receives an empty ERP-side snapshot today (Phase 8's documented limitation, unchanged by this phase), so "reconciliation issues" today only ever means "locally-succeeded records with nothing to compare against" — never a genuine local-vs-ERP mismatch. The UI states this explicitly rather than implying reconciliation ran against real ERP data.
- **Abandoned-cart rate mixes a snapshot with a range.** `abandonedCartCount` is a live snapshot (currently-inactive carts, not scoped to the selected date range) while `orderCount` is range-scoped; the resulting "rate" is documented as a rough proxy, not a true time-boxed funnel rate.
- **Return rate and CLV proxy are approximations**, not perfectly cohort-matched (a return counted in range may belong to an order placed outside it; CLV proxy ignores COGS/acquisition cost/time value) — both limitations are documented inline in `backend/lib/analytics/index.ts` and in the UI copy itself.
- **Order/order-item fetches are capped** (2,000 orders / 5,000 order items) for very large date ranges; the UI surfaces a truncation note rather than silently under-counting without warning. Revisit with server-side aggregation (a Postgres view or RPC) if/when order volume grows enough for this to matter.
- **Cohort section is a foundation, not a full retention engine** — CLV-proxy average is computed over a capped sample (up to 200 distinct customers who ordered in range), and no cohort-over-time chart exists. Full per-customer segmentation already lives in Phase 13's `segmentation.service.ts` / the Customers admin module; this phase intentionally does not duplicate it.

## Next-phase readiness

Phase 16 (final hardening/QA) can proceed: this phase adds no new external dependencies, no new migration, and does not modify any existing Phase 1–14 flow — `RequireAdmin`, all existing admin routes/pages, the `accounting`/`promotions` Edge Functions, and the ERP Sync Center are all used as-is, unmodified in behavior. The one shared-code change (exporting two previously-private constants from `segmentation.service.ts`) is additive and covered by Phase 13's existing passing test suite.
