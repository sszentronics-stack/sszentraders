# Phase 1 — Architecture, Database & Backend Foundation

Status: implemented (foundation only — see "Known limitations" and the
explicit Phase 2 readiness statement at the end).

## 1. Architecture

```
Frontend UI (Vite + React, static Hostinger hosting)
        |
        v
Application Services (backend/lib/* — money, status, validation, providers)
        |
        v
Repositories / Data Access
   - src/repositories/*        (public, RLS-safe reads: anon key, direct to Supabase)
   - supabase/functions/*      (privileged writes + secrets: service-role key, Edge Functions)
        |
        v
Supabase / PostgreSQL (supabase/migrations/*)
        |
        +-- LedGix ERP    (backend/lib/providers/ledgix)
        +-- Easypaisa     (backend/lib/providers/easypaisa)
        +-- Leopards      (backend/lib/providers/leopards)
```

**Why Edge Functions, not a Next.js/Node API layer.** The live site is a
Vite + React SPA deployed as static files to Hostinger shared hosting — no
VPS, no persistent Node process, no Docker. A traditional Node/Nest API
server cannot run here. Supabase Edge Functions (Deno, serverless, hosted by
Supabase — not by Hostinger) fill that role instead: they're the only place
service-role keys and third-party secrets (LedGix, Easypaisa, Leopards) may
live. Public, RLS-safe reads (published products/brands/categories/
collections) skip Edge Functions entirely and go straight from the Vite app
to Supabase via the anon key, because RLS alone already scopes that access
safely and correctly (see §5).

**Mobile readiness.** Everything privileged is an Edge Function reachable
over plain HTTPS with JSON in/out — nothing is coupled to React. The Sprint 2
Flutter app calls the same Edge Functions and the same Supabase REST+RLS
surface the Vite app uses; no Aura business rule lives only in a React
component.

## 2. Database schema

All SQL lives in `supabase/migrations/` (see that folder's own README for
the full file list and apply instructions) plus `supabase/seed.sql` for
dev-only seed data. ER overview:

```
customers ──< customer_addresses
customers ──< orders ──< order_items
                      ├─< order_status_history
                      ├─< payments ──< payment_events
                      ├─< shipments ──< shipment_events
                      └─< returns ──< return_items / return_events

products ──< product_variants ──< inventory_cache >── (LedGix ERP, via ledgix_item_id)
         ├─< product_images
         ├─< product_categories >── categories (self-referencing parent_id)
         └─< product_collections >── collections
products >── brands

orders ──< local_financial_transactions
erp_sync_jobs ──< erp_sync_events   (generic, any entity_type/entity_id)

profiles (1:1 auth.users) ──< customers (profile_id, nullable — guest checkout)
```

**Money convention.** Every monetary column is a `bigint` of minor currency
units (PKR paisa; 1 PKR = 100 paisa), never a float. `backend/lib/money` is
the single place that converts between major/minor units, formats for
display, and computes line/order totals — documented once in
`0001_extensions_and_enums.sql` and enforced by not duplicating the logic
anywhere else.

**Status convention.** Fixed, spec-defined state machines (`order_status`,
`payment_status`, `fulfillment_status`, `payment_event_status`,
`shipment_status`, `return_status`, `promotion_status`, `erp_sync_status`)
are Postgres ENUM types rather than a lookup-table pattern — cheaper, safer
at the type level, and appropriate because these vocabularies aren't meant
to be admin-editable at runtime. `backend/lib/status` mirrors the
`order_status`/`payment_status`/`fulfillment_status` enums in TypeScript and
adds the allowed-transition graph (`assertOrderStatusTransition`) so an
order can never silently jump states from application code, even before any
DB-level check runs.

**No hard deletes.** Historical order-dependent rows (products, brands,
categories, etc.) use `status`/`archived_at`, never `DELETE`.

## 3. Environment variables (names only — see `.env.example` for the authoritative, always-blank list)

Client-safe (`VITE_*`, exposed to the browser bundle by Vite's own
convention): `VITE_APP_ENV`, `VITE_APP_URL`, `VITE_WHATSAPP_SUPPORT_NUMBER`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_OAUTH_CLIENT_ID`,
`VITE_APPLE_OAUTH_CLIENT_ID`.

Server-only (Edge Function secrets, never `VITE_`-prefixed, never in the
Vite bundle): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`LEDGIX_API_BASE_URL`, `LEDGIX_API_KEY`, `LEDGIX_COMPANY_ID`,
`EASYPAISA_MERCHANT_ID`, `EASYPAISA_STORE_ID`, `EASYPAISA_HASH_KEY`,
`EASYPAISA_API_BASE_URL`, `EASYPAISA_WEBHOOK_SECRET`, `LEOPARDS_API_KEY`,
`LEOPARDS_API_PASSWORD`, `LEOPARDS_API_BASE_URL`, `EMAIL_PROVIDER_API_KEY`,
`EMAIL_FROM_ADDRESS`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `APPLE_OAUTH_CLIENT_SECRET`, `LOG_LEVEL`.

`.env.example` at the repo root is the single authoritative template (all
values blank). `backend/config/.env.example` is a short pointer back to it —
kept deliberately non-divergent rather than duplicated.

- `src/lib/config/env.ts` — the only place the Vite app reads
  `import.meta.env`. Validation is **lazy**: importing the module never
  throws (so a blank `.env` doesn't break `npm run build`); calling
  `getSupabaseConfig()` throws a clear, actionable `MissingEnvVarError`
  naming the exact variable and pointing at `.env.example`.
- `supabase/functions/_shared/config.ts` — the mirror-image module for Edge
  Functions, reading `Deno.env.get(...)`. Provider config getters
  (`getLedGixConfig()` etc.) return `null` rather than throwing when unset,
  so the provider skeleton can report `IntegrationNotConfiguredError`
  instead of crashing function boot.

## 4. Supabase configuration

No live project exists in this environment. Once one does:

1. `supabase link --project-ref <ref>`
2. `supabase db push` (applies `supabase/migrations/*.sql` in order)
3. `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... LEDGIX_API_KEY=... ...` for every server-only variable in `.env.example`
4. `supabase functions deploy <name>` for each folder under `supabase/functions/` (see §6)
5. Populate `.env.local` (gitignored) with the `VITE_*` values for local `npm run dev`

## 5. Storage strategy

Three public-read, admin/service-role-write buckets are created in
`0015_storage_buckets.sql`: `product-images`, `brand-assets`,
`category-assets`. Paths must use stable IDs, never product names, e.g.
`product-images/{product_id}/{variant_id-or-'default'}/{image_id}.webp`.

**Not migrated in Phase 1:** the current static images under `public/`
(`public/products/**`, `public/banners/**`, logo/favicon) stay exactly
where they are — the live storefront's `<img src="/products/...">` paths
are untouched. Future migration path (Phase 3/4): upload each existing
image to the matching bucket path, update `product_images.storage_path`,
switch the relevant `<img>` sources to a signed/public storage URL, and only
then remove the old file from `public/` — done product-by-product, never a
big-bang cutover.

## 6. Service / repository organization & the Edge Functions decision

Per the corrected Vite stack, `backend/services/*` (the pre-existing
placeholder folders) stays the **conceptual/documentation home** — each
README now states its Phase 1 status and points at the real code. The
**deployable** code lives in two places:

- `backend/lib/*` — runtime-agnostic shared logic (money, status,
  validation, errors, response envelope, logger, audit, provider
  interfaces + skeletons, domain types). Plain TypeScript, zero Node/Deno-
  only APIs, so it's imported unmodified by both Edge Functions (Deno
  supports relative `.ts` imports with no build step) and, via the
  `@lib/*` path alias, by frontend code later.
- `supabase/functions/*` — the actual Edge Functions, one per
  `backend/services/*` responsibility:

  | Edge Function | Maps to | Phase 1 behavior |
  |---|---|---|
  | `auth` | `backend/services/auth` | Idempotently ensures a `profiles` row exists for the caller's JWT. |
  | `products` | `backend/services/products`, `catalog` | Admin-only product+variant create, validated + audited. |
  | `orders` | `backend/services/orders` | Validates request shape, then `NotImplementedYetError` (Phase 6). |
  | `payments` | `backend/services/payments/easypaisa` | `NotImplementedYetError` (Phase 10). |
  | `shipments` | `backend/services/delivery/leopards` | `NotImplementedYetError` (Phase 11). |
  | `returns` | `backend/services/reviews` (returns half) | `NotImplementedYetError` (Phase 14). |
  | `accounting` | `backend/services/accounting` | `NotImplementedYetError` (Phase 7). |
  | `integrations-ledgix` | `backend/services/erp/ledgix` | Wires `LedGixErpProvider` — throws `IntegrationNotConfiguredError`. |
  | `integrations-easypaisa` | `backend/services/payments/easypaisa` | Wires `EasypaisaProvider` — throws `IntegrationNotConfiguredError`. |
  | `integrations-leopards` | `backend/services/delivery/leopards` | Wires `LeopardsCourierProvider` — throws `IntegrationNotConfiguredError`. |

  Named flat + hyphenated (`integrations-ledgix`, not `integrations/ledgix`)
  because the Supabase CLI keys a function's deploy/serve name off its
  immediate folder under `supabase/functions/`; a flat name keeps
  `supabase functions deploy integrations-ledgix` unambiguous.

- `src/repositories/*` — the read-path repository layer for the Vite app
  (`products.repository.ts`, `brands.repository.ts`,
  `categories.repository.ts`). Thin wrappers around
  `src/lib/supabase/client.ts` — components must never call
  `.from(...)` directly. **Not wired into any page/component in Phase 1** —
  the live storefront still reads `src/data/products.js` exactly as before;
  Phase 3/4 is where UI switches over.

One authoritative implementation per responsibility throughout — no
`product-service.ts` + `productService.ts` + `products-api.ts` overlap.

## 7. RLS strategy

`supabase/migrations/0014_row_level_security.sql`. Deny-by-default: a table
with no matching policy denies all `anon`/`authenticated` access. Shape:

- **Public catalog reads** (`brands`, `categories`, `collections`,
  `products`, `product_variants`, `product_images`, join tables): `anon` +
  `authenticated` may `SELECT` rows with `status = 'published'` only.
- **Self-scoped identity** (`profiles`, `customers`, `customer_addresses`,
  `orders`, `order_items`, `order_status_history`, `payments`, `shipments`,
  `returns`): a logged-in user may read/write only rows traceable back to
  their own `auth.uid()` via the `current_profile_id()` helper.
- **Admin flag**: `profiles.is_admin boolean` (simple, Phase 1-appropriate;
  a richer role model can replace it later without changing the RLS shape).
  `is_admin()` is a `SECURITY DEFINER` SQL function so policies can call it
  cheaply.
- **Fully internal tables** (`payment_events`, `shipment_events`,
  `return_items`, `return_events`, `coupons`, `local_financial_transactions`,
  `erp_sync_jobs`, `erp_sync_events`, `inventory_cache`, `idempotency_keys`,
  `audit_logs`): no `anon`/`authenticated` policy at all — only admins (via
  `is_admin()`) or the service role (which bypasses RLS entirely, by
  Supabase default, inside Edge Functions).
- **Storage**: public read on all three buckets; write/update/delete
  restricted to `is_admin()` or the service role.

The service-role key is never referenced from `src/`, never logged (see
`backend/lib/logger`'s secret-key redaction), and is grepped for in the
built `dist/` bundle as part of build validation (see the completion
report).

## 8. ERP integration architecture (LedGix)

Source-of-truth rule, enforced by comments directly on the relevant tables
and by the provider skeleton never faking success:

```
Aura local record  →  LedGix ERP API call  →  ERP document created  →  Aura stores the ERP reference back
(local_financial_transactions,      (backend/lib/providers/ledgix/       (ledgix_invoice_id, ledgix_receipt_id,
 orders, payments)                   LedGixErpProvider — Phase 8)         ledgix_customer_id, ledgix_item_id columns)
```

Accounting: `local_financial_transactions` is an operational record of what
Aura believes happened, not a competing ledger — LedGix is authoritative.

Inventory: `inventory_cache` is a **synced operational copy only**, written
exclusively by the future ERP sync job — never independently authoritative,
never adjustable by any Phase 1 (or later storefront) code path.

## 9. Easypaisa / Leopards integration points

Both follow the same pattern as LedGix: an interface
(`PaymentProvider`/`CourierProvider`), a skeleton implementation that throws
`IntegrationNotConfiguredError` for every operation, and an Edge Function
(`integrations-easypaisa`/`integrations-leopards`) that wires the skeleton
to `supabase/functions/_shared/config.ts`. No live HTTP calls exist yet; no
method ever returns a fabricated success payload.

## 10. Migration instructions

See `supabase/migrations/README.md` for the full ordered file list and the
`supabase db push` / dashboard-SQL-editor apply instructions (no live
project exists in this environment, so these have been written and
reviewed but not run against a real database).

## 11. Dev setup

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY once a project exists
npm run dev                  # unchanged — storefront works with or without Supabase configured
npm run typecheck            # tsc --noEmit over backend/lib + src/lib + src/repositories
npm test                     # vitest run
npm run lint                 # oxlint
npm run build                # vite build
```

## 12. Deployment implications

The Vite app still builds to `dist/` and deploys to Hostinger as static
files — nothing about that changed. Supabase (database + Edge Functions) is
deployed and managed entirely separately via the Supabase CLI/dashboard;
Hostinger never runs any part of the backend.

## 13. Known limitations

- No live Supabase project/credentials exist in this environment — nothing
  here has been run against a real database. Migrations are written,
  reviewed, and covered by unit tests for the TypeScript layer, but not yet
  applied.
- `supabase/functions/` is excluded from `npm run typecheck` (Deno globals
  like `Deno.serve`/`Deno.env` aren't available to the Node-based `tsc` run
  here). A `deno.json` is provided for editor support; typecheck it for
  real with `deno check supabase/functions/**/*.ts` once the Deno CLI is
  available (not installed in this environment either).
- `backend/lib/types/domain.ts` is hand-written, not
  `supabase gen types typescript`-generated (no linked project yet — see
  `supabase/migrations/README.md` for the command to run once one exists).
- The repository layer (`src/repositories/*`) and Supabase browser client
  are written and unit-testable in shape, but not wired into any page —
  intentionally, since Phase 1 is foundation-only and the live storefront
  must keep working exactly as-is.
- `orders`/`payments`/`shipments`/`returns`/`accounting` Edge Functions are
  intentionally inert (`NotImplementedYetError`) rather than partially
  functional, to avoid a half-built checkout path that looks live but isn't.

## 14. Phase 2 readiness

Phase 2 (Customer Authentication & Profiles) can build directly on:
`profiles`/`customers`/`customer_addresses` tables and their RLS policies,
the `auth` Edge Function's profile-bootstrap pattern, `backend/lib/validation`'s
`customerAddressSchema`/`createCustomerSchema`, and
`src/lib/supabase/client.ts` for the frontend auth session. No schema
changes should be required to start Phase 2 — only new Edge Functions
(signup/login/reset flows) and frontend UI.
