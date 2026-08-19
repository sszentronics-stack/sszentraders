# Phase 12 Completion Report — Admin Operations Dashboard

## Implementation summary

Phase 12 builds the internal `/admin/*` workspace Aura staff use to operate products, orders, customers, payments, shipments, returns, ERP sync, inventory mapping, integration status, and the audit log — a UI layer on top of the fully-built-out Phases 1–11/14 backend, with (per the concurrency notice) the Promotions module deliberately left out for the concurrent Phase 13 agent to own.

Delivered:
- `RequireAdmin` (`src/components/admin/RequireAdmin.jsx`) — client-side gate for the whole `/admin/*` tree, re-reading the caller's own `profiles.is_admin` via a fresh RLS-scoped query (`getMyProfile()`) on every mount, independent of `AuthContext`'s cached profile shape.
- `AdminLayout` (`src/components/admin/AdminLayout.jsx`) — a separate internal-tool shell (dark sidebar, dense main area) rendered as a sibling top-level route to the customer-facing `Layout`, not nested inside it — no announcement bar / header / footer / cart drawer.
- A shared admin UI kit (`src/components/admin/ui.jsx`): cards, stat boxes, status pills, pagination, empty/error/loading states, and a `useConfirm()` hook that gates every destructive/financial action behind an explicit confirm dialog.
- A lightweight toast/status-feedback system (`src/context/admin/AdminToastContext.jsx`) — the storefront has no equivalent, so this is scoped to the admin tree.
- Thirteen admin repositories under `src/repositories/admin/` — products, catalog (brands/categories/collections), orders, customers, payments, shipments, returns, reviews, accounting/ERP, inventory, and audit logs.
- Thirteen route-mapped admin pages under `src/pages/admin/`: Dashboard, Products (list/create/detail with variants+images), Catalog manager, Orders (list/detail with cancellation), Customers (list/detail), Payments queue + reconciliation/refund, Shipments queue (retry booking/refresh tracking), Returns queue/detail (full review→approve/reject→received→inspection→refund/replacement→close workflow), Reviews moderation queue, ERP Sync Center, Inventory mapping center, Settings (integration status), Audit Log viewer.
- One new backend route: `GET /accounting/integrations/status` on the existing `accounting` Edge Function, returning `{ledgix, easypaisa, leopards}: {configured: boolean}` — booleans only, computed from `_shared/config.ts`'s existing presence checks, never a secret value.
- `src/index.css` gained an "Admin operations dashboard" section (~550 lines) reusing Aura's existing `@theme` color tokens (blush/rose/ink) in a denser, information-focused layout distinct from the storefront's look.

## Architecture and key decisions

- **Reads go directly through RLS, not through new Edge Function routes, wherever RLS already allows it.** Inspecting `0014_row_level_security.sql` showed every commerce table already has an `..._admin_all` policy granting a caller with `profiles.is_admin = true` full read (and write) access — `products`, `orders`, `customers`, `customer_addresses`, `payments`, `shipments`, `audit_logs`, etc. This is the same "RLS-scoped repository" pattern the public storefront already uses (`src/repositories/products.repository.ts` and friends) — the admin repositories in `src/repositories/admin/` just query with a different filter (no `status = 'published'` restriction, admin-only columns included) and are still fully server-verified by Postgres RLS, not by anything client-trusted. This is why product/order/customer/audit-log **list and detail reads** needed zero new backend code, keeping this phase's backend footprint to one new route.
- **Mutations always go through the existing, already-`requireAdmin`-gated, already-audited Edge Functions** — never a direct table write from the browser. Product/variant/image CRUD and publish/unpublish/archive go through `products`/`catalog`; order cancellation reuses `orders`'s existing `POST /:id/cancel` (which already accepts an admin caller); payment refund/reconciliation go through `payments`'s Easypaisa admin routes; shipment retry/refresh/booking go through `shipments`'s action-dispatch router; return review/approve/reject/received/inspection/close go through `returns`; review moderation goes through `reviews`; ERP retry/sync-now and inventory mapping/sync go through `accounting`/`inventory`. This satisfies the phase's security requirement — every mutation is re-verified server-side by `requireAdmin()` and audited by `writeAuditLog()` inside the Edge Function itself, and this UI layer cannot bypass that even if a component had a bug.
- **The one new backend route lives inside `accounting`'s existing router**, not a new function, because it's the same "admin operational diagnostics" surface as the pre-existing `GET /erp/health` — same file, same `requireAdmin` gate, same never-leak-secrets contract, reusing `_shared/config.ts`'s existing `getLedGixConfig()`/`getEasypaisaConfig()`/`getLeopardsConfig()` presence checks (`!== null` is the boolean).
- **Dashboard composes independent queries with per-card failure isolation.** Each dashboard tile (`src/pages/admin/Dashboard.jsx`) loads via its own promise; one slow/unreachable dependency shows its own inline error instead of blanking the page — important in an environment where no live Supabase project exists yet. No new aggregation endpoint was added; "today's orders/revenue" and "pending orders" are simple queries against `orders`, and the other cards reuse the exact list functions their own module pages use (unmapped inventory, unsynced ERP events, booking-error shipments, requested returns).
- **`RequireAdmin` deliberately does not trust `AuthContext`'s cached `profile`.** That context's `profile` state is populated from the `auth` Edge Function's raw snake_case row (`is_admin`, not `isAdmin`) and is only refreshed on sign-in events — using it directly for a security-relevant gate risked both a naming mismatch and staleness. `RequireAdmin` instead calls `src/repositories/customers.repository.ts`'s existing `getMyProfile()` (a fresh, camelCased, RLS-scoped read) on every mount of the admin tree. This is a client-side UX gate only — the file's own comment says so — the real enforcement is server-side `requireAdmin()`/RLS.
- **Admin route tree is a sibling of the storefront's `Layout` route, not nested inside it**, per the "clearly distinguishable as an internal tool" requirement — no `AnnouncementBar`/`Header`/`Footer`/`CartDrawer` wraps `/admin/*`.
- **No raw inventory quantity editing anywhere in the UI**, per Phase 9's explicit rule — `InventoryCenter.jsx` only offers "sync from ERP" and "map variant to LedGix item id," both of which call existing Phase 9 endpoints; there is no numeric stock-quantity input field anywhere in this phase's code.
- **Promotions is intentionally absent from `AdminLayout`'s nav** (`src/components/admin/AdminLayout.jsx`'s `NAV` array and its header comment both call this out) — see "Known limitations" below.

## Database-schema changes

None. No new migration was added. This is a UI + one read-route phase; every table/column/enum/RLS policy this phase depends on already existed from Phases 1–11/14.

## UI/UX changes

New `/admin/*` route tree (see `src/App.jsx`):
- `/admin` — Dashboard (today's orders/revenue, pending confirmations, ERP status, and five "needing attention" queue cards linking to their full pages)
- `/admin/products`, `/admin/products/new`, `/admin/products/:id` — list/search/filter, minimal create flow (name + starter variant → draft), full detail editor (fields, publish/unpublish/archive, variant add/publish/unpublish/archive, image upload/set-primary/remove)
- `/admin/catalog` — tabbed brand/category/collection manager (create, rename, publish/unpublish/archive)
- `/admin/orders`, `/admin/orders/:id` — list/search/filter by status, detail with customer/address snapshot, items/totals, payment/fulfillment status, shipment tracking timeline, request-cancellation action
- `/admin/customers`, `/admin/customers/:id` — list/search, detail with profile, addresses, order history, marketing consent (read-only per spec — customers manage their own profile from `/account`)
- `/admin/payments` — needing-attention queue + reconciliation detail + refund action
- `/admin/shipments` — booking-error/needs-attention queue with retry-booking and refresh-tracking actions
- `/admin/returns`, `/admin/returns/:id` — status-filtered queue, full detail with the entire review→approve/reject→received→inspection(refund/replacement)→close workflow
- `/admin/reviews` — moderation queue (publish/reject)
- `/admin/erp` — ERP health, unsynced financial events (requeue/sync-now), reconciliation issues
- `/admin/inventory` — unmapped-variant list + map action, sync-from-ERP trigger
- `/admin/settings` — integration configured/not-configured status (booleans only)
- `/admin/audit-log` — filterable audit trail viewer

Every destructive/financial action (archive, reject, refund, cancellation request) routes through `useConfirm()`'s modal; every mutation surfaces a toast on success/failure. Tables scroll horizontally on narrow viewports; the two-column detail grids collapse to one column under 960px; the sidebar collapses to a top stack under 900px (tablet-checked via CSS breakpoints, desktop-primary per spec).

## Security and permissions

- Every admin mutation is issued through an existing, already-`requireAdmin`-gated Edge Function — this phase added no new mutation endpoint and no direct-table-write mutation path from the browser.
- The one new read route (`GET /accounting/integrations/status`) is gated by the same `requireAdmin(req)` call already guarding every other route in that file, and returns only `{configured: boolean}` per integration — verified by inspection that it never touches or returns `apiKey`/`hashKey`/`apiPassword`/webhook secret values, only the `!== null` result of each `get*Config()` presence check.
- `RequireAdmin` is a UX convenience, not the security boundary; every doc comment in the new repository files states this explicitly, matching the codebase's existing "RLS/requireAdmin is the real gate" convention (`src/repositories/products.repository.ts`'s header comment says the same about its own defense-in-depth filters).
- Admin list/detail reads rely on Postgres RLS `..._admin_all` policies already shipped in `0014_row_level_security.sql` — no policy was added, weakened, or bypassed.

## External integration impact

None of Phase 10/11/8's provider code changed. The dashboard only calls the already-existing admin-gated diagnostic/action endpoints (`accounting`, `inventory`, `payments`, `shipments`, `returns`, `reviews`) — no new external API calls, no new webhook, no new secret.

## Tests and build results

Per the task's explicit minimal-testing instruction, no new test files were added — this phase is UI wiring over already-tested backend services (Phases 1–11/14 each carry their own coverage). Existing suite verified to still pass:

- `npx tsc --noEmit -p tsconfig.json` — clean, no errors.
- `npx oxlint` — no errors; only pre-existing `react-hooks`/`react-refresh` warning categories, consistent with the same warning already present on other pre-existing context files (`CartContext.jsx`, `AuthContext.jsx`, `WishlistContext.jsx`).
- `npx vitest run` — 41 test files, 359 tests, all passing (unchanged from before this phase — no test was added or removed).
- `npx vite build` — succeeds; output includes a single-chunk size warning (>500kB), a pre-existing characteristic of this SPA's bundling, not introduced by this phase's `import()` usage (all admin routes are static imports, matching the rest of the app's routing style).

## Files created/modified/deleted

**Modified:**
- `supabase/functions/accounting/index.ts` — added `GET /integrations/status` route + doc-comment update.
- `src/App.jsx` — added the `/admin/*` route tree and its imports.
- `src/index.css` — appended the admin dashboard's CSS.

**Created (backend: none — see above). Created (frontend):**
- `src/components/admin/RequireAdmin.jsx`, `src/components/admin/AdminLayout.jsx`, `src/components/admin/ui.jsx`
- `src/context/admin/AdminToastContext.jsx`
- `src/repositories/admin/{products,catalog,orders,customers,payments,shipments,returns,reviews,accounting,inventory,auditLog}.admin.repository.ts`
- `src/pages/admin/Dashboard.jsx`
- `src/pages/admin/products/{ProductList,ProductForm,ProductDetail}.jsx`
- `src/pages/admin/catalog/CatalogManager.jsx`
- `src/pages/admin/orders/{OrderList,OrderDetail}.jsx`
- `src/pages/admin/customers/{CustomerList,CustomerDetail}.jsx`
- `src/pages/admin/payments/PaymentsQueue.jsx`
- `src/pages/admin/shipments/ShipmentsQueue.jsx`
- `src/pages/admin/returns/{ReturnsQueue,ReturnDetail}.jsx`
- `src/pages/admin/reviews/ReviewsQueue.jsx`
- `src/pages/admin/erp/ErpSyncCenter.jsx`
- `src/pages/admin/inventory/InventoryCenter.jsx`
- `src/pages/admin/settings/Settings.jsx`
- `src/pages/admin/audit/AuditLog.jsx`

No files were deleted.

## Migrations/configuration required

None beyond what Phases 1–11/14 already require. No new environment variable, no new migration, no new Supabase secret. The new `GET /accounting/integrations/status` route deploys with the rest of the `accounting` function on the next `supabase functions deploy accounting`.

## Known limitations / deferred items

- **Promotions is intentionally omitted** from `AdminLayout`'s navigation and from `/admin/*`'s route tree, per the concurrency notice: Phase 13 (Promotions, Loyalty & Customer Intelligence) is being built concurrently by a separate agent and owns that module's admin UI end-to-end. A follow-up integration pass (project owner or a later agent) needs to add a "Promotions" nav entry pointing at wherever Phase 13 lands its route, once both branches are merged.
- Product image gallery shows each image's storage path as a caption rather than a rendered thumbnail — the `product-images` bucket is private (signed-upload-only), so there is no stable unsigned URL to render from the admin list view without either a signed-read-URL round trip per image or a public-read policy change; out of scope for this phase to add either.
- Customer module is read-only (profile/addresses/order history), as scoped by the spec ("if the schema has room... if not, skip") — no support-notes field exists in the schema, so none was added.
- The dashboard's "revenue today" and "orders today" are computed with a simple client-local `gte(placed_at, startOfDay)` query, per the spec's explicit instruction not to build a full analytics engine (that's Phase 15); timezone is the browser's local time, not a configured store timezone.
- No pagination/virtualization tuning was done beyond simple offset/limit — acceptable at Aura's current and near-term order/product volumes; would need revisiting at much larger scale.
- `integrations-ledgix`, `integrations-easypaisa`, and `integrations-leopards` Edge Functions remain unauthenticated raw provider passthroughs (a pre-existing condition from Phases 8/10/11, not introduced or worsened here) — this admin UI deliberately never calls them directly, routing every privileged action through `accounting`/`payments`/`shipments`/`inventory`/`returns` instead, all of which are properly gated.

## Next-phase readiness

The `/admin/*` shell, its shared UI kit, toast system, and `RequireAdmin` gate are all reusable building blocks for Phase 13's Promotions UI and Phase 15's analytics UI — both can mount as additional routes inside the same `AdminLayout` without duplicating the sidebar/gate/toast infrastructure. The one new route this phase added (`GET /accounting/integrations/status`) is a stable, narrow contract a future settings page (e.g. once real secrets exist) can keep building on.
