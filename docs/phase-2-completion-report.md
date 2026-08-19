# Phase 2 Completion Report — Customer Authentication & Profiles

## 1. Implementation summary

Phase 2 adds Supabase Auth–based registration, login, logout, email
verification, and password reset/recovery to the storefront using the
existing Aura visual language, plus a customer account shell (Profile,
Addresses fully implemented; Orders/Wishlist/Preferences as "coming soon"
placeholders). Registration/login transactionally ensure exactly one
`customers` row exists per authenticated user, deduplicating against any
pre-existing guest customer by email/phone rather than creating a second
row. Saved addresses support create/edit/delete and default
shipping/billing selection, enforced atomically at the database level.
Server-side authorization helpers and an admin-safe customer lookup
function are in place for future Edge Functions/the admin module (Phase
12) to reuse. Guest identity continuity (for Phase 5's cart) has its
foundation laid via Supabase Auth's anonymous sign-in, exposed but not
auto-invoked. `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build` all pass. No existing storefront page, route, or the
WhatsApp checkout flow was modified in a breaking way — only `Header.jsx`
(added an account icon) and `App.jsx` (added routes) changed among
previously-existing frontend files.

The stack correction from the task brief was followed throughout: no
Next.js, no API routes, no VPS — Vite + React SPA stays the frontend,
`VITE_*` the client-env convention, Supabase Edge Functions (Deno) the
privileged/server-only surface.

## 2. Architecture and key decisions

- **Business logic lives in `backend/lib/auth/`** (not `backend/services/auth`,
  which — like every other `backend/services/*` folder in this repo — is a
  documentation-only, phase-mapped pointer per Phase 1's established
  convention; see `backend/lib/README.md`). Three modules:
  - `linking.ts` — `ensureCustomerForProfile()`, the dedup-safe "create or
    link a `customers` row for this authenticated profile" logic.
  - `authorization.ts` — `assertOwnsResource()` / `assertOwnsCustomerResource()`,
    defense-in-depth ownership checks for any Edge Function using the
    service-role client.
  - `customerLookup.ts` — `findCustomersByEmailOrPhone()`, an admin-safe
    lookup function (not a UI — Phase 12 builds that).
  All three are **dependency-injected** (plain async functions, not a
  Supabase client parameter) specifically so the business logic is unit
  testable without mocking Supabase's fluent query builder, and so the same
  logic can be wired into both the Deno Edge Function and any future runtime.
- **Address CRUD goes directly from the browser to Supabase via RLS**
  (`src/repositories/customers.repository.ts`), not through an Edge
  Function — `customer_addresses_self_all` in `0014_row_level_security.sql`
  already scopes every row to its owner, so a privileged service-role hop
  would add latency and an extra audited path without adding safety. Only
  the *dedup-across-customers* linking step (registration/login) needs the
  service-role key, because RLS correctly prevents an ordinary authenticated
  user from ever seeing another customer's row to check for a match — that
  step goes through `supabase/functions/auth/index.ts`.
- **Default-address exclusivity is enforced by a Postgres trigger**
  (`0016_address_default_enforcement.sql`), not an RPC or Edge Function: the
  partial unique indexes from Phase 1 (`uq_customer_addresses_default_shipping/
  billing`) reject a second default unless the first is cleared in the same
  transaction. A `BEFORE INSERT OR UPDATE` trigger does that clear-then-set
  atomically, running under the *caller's* role (not `SECURITY DEFINER`), so
  it stays governed by the same RLS policy that already lets a customer
  write their own other rows.
- **Guest identity foundation uses Supabase Auth's built-in anonymous
  sign-in** (`ensureGuestSession()` in `AuthContext.jsx`) rather than a new
  bespoke session table — Supabase already promotes an anonymous session to
  a permanent one via `updateUser({ email, password })` without losing the
  underlying `auth.users.id`, which is exactly "cart/order can exist before
  registration and be safely claimed after login." It is exposed but never
  called automatically on page load (that would create a Supabase Auth user
  per anonymous visitor for no reason yet); Phase 5 will call it when a
  guest actually adds to cart/checks out.
- **New shared files were added narrowly** (`backend/lib/auth/*`,
  `backend/lib/types/profile.ts`) rather than editing `backend/lib/types/domain.ts`
  or restructuring existing shared modules, to minimize merge conflicts with
  the parallel Phase 3 (Product Catalog) agent working off the same base
  commit. `backend/lib/validation/index.ts` was extended additively (new
  schemas appended, nothing existing changed); no other shared config file
  (`vite.config.js`, `tsconfig.json`) needed edits because the new logic
  lives under `backend/lib/**`, already covered by both files' includes.

## 3. Database-schema changes

One new migration:

- **`supabase/migrations/0016_address_default_enforcement.sql`** — adds
  `enforce_single_default_address()` and a trigger on `customer_addresses`
  that atomically unsets a customer's previous default shipping/billing
  address when a new one is promoted. No table/column changes; Phase 1's
  `profiles`, `customers`, `customer_addresses` schema and RLS policies were
  used as-is.

## 4. UI/UX changes

- New routes (`src/App.jsx`): `/login`, `/register`, `/forgot-password`,
  `/reset-password`, `/account` (+ `/account/addresses`, `/account/orders`,
  `/account/wishlist`, `/account/preferences`), all rendered inside the
  existing `Layout` (header/footer/announcement bar/WhatsApp button
  untouched).
- `src/components/Header.jsx` gained a `User` icon (lucide-react, matching
  the existing search/cart icon style) linking to `/account` when signed in
  or `/login` otherwise — hidden entirely when Supabase isn't configured, so
  it never appears half-broken.
- New auth pages (`src/pages/auth/`): `Login`, `Register`, `ForgotPassword`,
  `ResetPassword` — built with the existing `.btn-lavender`/`.btn-outline`/
  `.container-aura` classes plus a new, additive set of form/auth-card CSS
  classes in `src/index.css` (`.auth-shell`, `.auth-card`, `.form-input`,
  `.form-checkbox-row`, `.spinner`, etc.) using the existing color tokens
  (`--color-blush`, `--color-rose`, `--color-ink`) — no new colors
  introduced, no existing rule modified.
  - Password fields have a show/hide toggle (`PasswordField.jsx`).
  - Client-side validation reuses the same Zod schemas the Edge Function
    validates with server-side (`backend/lib/validation`), so error copy is
    consistent and never duplicated.
  - Loading states (`.spinner`) and disabled-button states throughout.
  - Forgot-password always shows the same success banner regardless of
    whether the email is registered (see Security section).
- Account shell (`src/pages/account/AccountLayout.jsx`): left-nav (desktop)
  / stacked (mobile, via `.account-shell` grid collapsing at 860px) with
  Profile / Addresses / Orders / Wishlist / Preferences + Sign Out. Orders/
  Wishlist/Preferences render `ComingSoon.jsx`, a small reusable placeholder
  — not full features, per spec.
  - `Profile.jsx` — edit first/last name, phone (validated Pakistani mobile
    format), marketing consent; email shown read-only (email change is
    out of scope this phase).
  - `Addresses.jsx` — list, add, edit, delete, "set as default
    shipping"/"set as default billing" actions; inline form reusing the
    same `customerAddressSchema` used server-side.
- Browsing remains fully ungated — no route outside `/account/*` requires
  auth; `ProtectedRoute.jsx` is the only auth gate and only wraps `/account`.

## 5. Security and permissions

- **RLS is the primary boundary** (unchanged from Phase 1): `profiles_self_*`,
  `customers_self_*`, `customer_addresses_self_all` in
  `supabase/migrations/0014_row_level_security.sql`. The browser's anon-key
  client (`src/lib/supabase/client.ts`) never sees another customer's row,
  full stop — not because the frontend filters it out, but because Postgres
  does.
- **Defense in depth for privileged (service-role) code**:
  `backend/lib/auth/authorization.ts`'s `assertOwnsResource()` /
  `assertOwnsCustomerResource()` are the reusable helpers any future
  Edge Function must call before touching a customer-scoped row with the
  service-role client, which bypasses RLS. Documented explicitly: never
  trust a customerId/profileId/addressId supplied by the browser without
  verifying ownership server-side.
- **No enumeration surface**: `ForgotPassword.jsx` shows the identical
  success banner ("If an account exists for that email...") whether or not
  the email is registered, and swallows any underlying error rather than
  branching UI on it. Supabase Auth's own `resetPasswordForEmail` /
  `signUp` behavior does not reveal account existence either.
- **Rate limiting**: relies entirely on Supabase Auth's built-in
  rate limits (per-IP and per-email limits on signup, sign-in, and
  password-recovery requests) — no application-level rate limiting was
  added, since Hostinger static hosting has no persistent server process to
  host one. This is a **known limitation** — see Section 8.
- **Audit logging** (`backend/lib/audit`, unchanged from Phase 1): the `auth`
  Edge Function writes `auth.registration_linked` / `auth.login_linked` /
  `auth.profile_updated` events with the acting profile id and minimal,
  non-secret metadata.
- **Passwords/tokens never touch application code beyond the Supabase SDK
  call itself** — no password is logged, stored, or passed through the
  audit module (which explicitly refuses metadata keys that look secret-like,
  Phase 1 behavior, unchanged).

## 6. External integration impact

None. LedGix ERP, Easypaisa, and Leopards remain untouched and out of scope.
`.env.example` required **no changes** — `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY` and the Google/Apple OAuth placeholder variables
were already present from Phase 1's authoring of the single env contract.

## 7. Tests and build results

```
npm run lint       ✅ pass (2 pre-existing-pattern warnings only — react/only-export-components
                        on AuthContext.jsx and CartContext.jsx, both intentionally export a
                        hook + provider from one file, matching the established CartContext pattern)
npm run typecheck   ✅ pass, no errors
npm test            ✅ 66/66 tests pass across 12 files (15 new Phase 2 tests added)
npm run build       ✅ production build succeeds (dist/ generated; pre-existing >500kB
                        chunk-size advisory only, not a Phase 2 regression)
```

New test files:
- `backend/lib/auth/linking.test.ts` — dedup logic: creates new customer,
  is idempotent across repeated calls, updates in place on email/phone
  change, claims a matching guest customer by email, claims by phone when
  email doesn't match.
- `backend/lib/auth/authorization.test.ts` — ownership assertions allow the
  owner, always allow admins, deny cross-customer/cross-profile access, deny
  when the caller has no linked customer yet.
- `backend/lib/auth/customerLookup.test.ts` — returns matches, returns an
  empty array (not an error) when nothing matches, de-duplicates a hit found
  via both email and phone.
- `backend/lib/validation/auth-validation.test.ts` — registration/login/
  password-reset/profile-update/address-update schema validation, including
  rejecting a short password and an invalid phone number.

RLS cross-customer denial and the default-address invariant are documented
as ready-to-run SQL test cases in `docs/phase-2-rls-test-plan.sql`, since no
live Supabase project/credentials exist in this environment to execute them
against — see that file for the full list (profile self-read/update, address
ownership, default-address atomicity, admin bypass, dedup-on-relink).

## 8. Files created/modified/deleted

**Created:**
- `supabase/migrations/0016_address_default_enforcement.sql`
- `backend/lib/auth/linking.ts`, `authorization.ts`, `customerLookup.ts`, `index.ts`, `README.md`
- `backend/lib/auth/linking.test.ts`, `authorization.test.ts`, `customerLookup.test.ts`
- `backend/lib/validation/auth-validation.test.ts`
- `backend/lib/types/profile.ts`
- `src/context/AuthContext.jsx`
- `src/lib/supabase/functions.ts`
- `src/repositories/customers.repository.ts`
- `src/components/auth/PasswordField.jsx`, `ProtectedRoute.jsx`
- `src/pages/auth/Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`
- `src/pages/account/AccountLayout.jsx`, `Profile.jsx`, `Addresses.jsx`, `ComingSoon.jsx`
- `docs/phase-2-rls-test-plan.sql`
- `docs/phase-2-completion-report.md` (this file)

**Modified:**
- `supabase/functions/auth/index.ts` — extended from a single "ensure
  profile" POST into POST (dedup-safe ensure profile+customer) / GET
  `/profile` / PATCH `/profile`.
- `backend/lib/validation/index.ts` — additive: `passwordSchema`,
  `registerInputSchema`, `loginInputSchema`, `passwordResetRequestSchema`,
  `passwordResetConfirmSchema`, `updateProfileSchema`,
  `updateCustomerAddressSchema`, plus inferred types. Nothing existing
  changed.
- `src/App.jsx` — added `AuthProvider` wrapper and the new routes listed
  above; every pre-existing route/element unchanged.
- `src/components/Header.jsx` — added the account icon (see Section 4).
- `src/index.css` — appended the new auth/account CSS classes at the end of
  the file; no existing rule edited.
- `supabase/migrations/README.md`, `backend/services/auth/README.md` —
  documentation updates reflecting the above.

**Deleted:** none.

**Not touched (by design, to avoid conflicting with the parallel Phase 3
agent):** `src/data/products.js`, `src/repositories/products.repository.ts`,
`src/repositories/brands.repository.ts`, `src/repositories/categories.repository.ts`,
any catalog Edge Function, `backend/lib/types/domain.ts`.

## 9. Migrations/configuration required

To go live once a real Supabase project exists:

1. Run `supabase db push` (or apply SQL files in order via the dashboard SQL
   editor) — this now includes `0016_address_default_enforcement.sql` on
   top of Phase 1's 15 migrations.
2. In the Supabase dashboard, **Authentication → Providers → Email**:
   confirm "Confirm email" is enabled if email verification is desired
   (Register.jsx branches on whether `signUp()` returns a session
   immediately vs. requires verification — both paths are handled).
3. In **Authentication → URL Configuration**, set the Site URL and add
   `/{your-domain}/reset-password` and `/{your-domain}/login` as allowed
   redirect URLs — `ResetPassword.jsx` and the post-signup email link both
   rely on Supabase redirecting back to those exact paths.
4. In **Authentication → Providers → Anonymous Sign-ins**, enable "Allow
   anonymous sign-ins" before Phase 5 starts calling
   `ensureGuestSession()` — not required for Phase 2 itself, since nothing
   calls it automatically yet.
5. Deploy the updated `auth` Edge Function: `supabase functions deploy auth`.
6. No new environment variables — `.env.example` already covers everything
   this phase needs.

## 10. Known limitations/deferred items

- **No application-level rate limiting** beyond what Supabase Auth provides
  out of the box — Hostinger static hosting has no persistent process to
  host a custom limiter. Documented as relied-upon, not implemented.
- **Guest cart/order merge is not implemented** — only the identity
  mechanism it will need (anonymous Supabase Auth sessions,
  `ensureGuestSession()`) is in place. Phase 5 (Cart, Wishlist & Shopping
  State) builds the actual merge-on-login logic.
- **Email address changes are not supported** in `Profile.jsx` (shown
  read-only) — changing the Supabase Auth email itself requires a
  reverify-both-addresses flow that's out of scope for this phase's
  "profile editing" requirement; the field can be wired up later without
  any schema change.
- **RLS tests are documented, not executed** — see Section 7 and
  `docs/phase-2-rls-test-plan.sql`; no live Supabase project/credentials in
  this environment.
- **Social sign-in (Google/Apple) intentionally not implemented** — out of
  scope per spec; the data model (Supabase Auth's `auth.users` +
  `profiles`, with no email/password-specific constraint anywhere) does not
  block adding it later, and `.env.example` already reserves the client/
  server variable slots.
- **Admin customer lookup has no UI** — `backend/lib/auth/customerLookup.ts`
  is a plain function, ready for Phase 12's admin module to call from an
  Edge Function; it is not wired into anything reachable today.

## 11. Next-phase readiness

Phase 2 is complete and ready to hand off. Phase 3 (Product Management &
Product Display Engine) is unaffected — no shared file it's likely to touch
(`src/data/products.js`, product repositories, catalog Edge Functions) was
modified here, and the only shared files touched
(`backend/lib/validation/index.ts`, `src/App.jsx`, `src/components/Header.jsx`,
`src/index.css`) were edited additively (new lines only, no existing lines
changed) to minimize merge friction. Phase 4 (Premium Storefront UI/UX) can
build on the new account shell's visual language. Phase 5 (Cart, Wishlist &
Shopping State) has both its customer-identity dependency (this phase) and
its guest-session foundation (`ensureGuestSession()`) ready to consume.
