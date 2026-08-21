# auth

**Phase:** 2

Registration, login, logout, password recovery, email verification, customer profiles, addresses, guest checkout, guest-to-customer conversion, preferences.

Status: **implemented** (Phase 2). See `docs/phase-2-completion-report.md` for the full writeup.

## Phase 1 foundation
- Schema: `supabase/migrations/0002_profiles_customers.sql`, `0003_customer_addresses.sql`.
- RLS: `supabase/migrations/0014_row_level_security.sql` (self-read/write policies + `is_admin()` helper).
- Deployable code home: `supabase/functions/auth/index.ts` — Phase 1 shipped only an idempotent "ensure profile row exists for this JWT" endpoint, not full signup/login/reset flows.

## Phase 2 implementation
- Business logic: `backend/lib/auth/` (`linking.ts` dedup-safe profile↔customer linking, `authorization.ts` ownership helpers, `customerLookup.ts` admin-safe lookup) — runtime-agnostic, unit-tested.
- Migration: `supabase/migrations/0016_address_default_enforcement.sql` — atomic default-shipping/default-billing swap trigger.
- Edge Function: `supabase/functions/auth/index.ts` extended with `GET/PATCH /auth/profile` and a dedup-safe `POST /auth`.
- Frontend: `src/context/AuthContext.jsx` (Supabase Auth session/register/login/logout/password-reset), `src/repositories/customers.repository.ts` (RLS-scoped profile/address reads+writes), `src/pages/auth/*`, `src/pages/account/*`.
- Full detail: `docs/phase-2-completion-report.md`.
