# auth

**Phase:** 2

Registration, login, logout, password recovery, email verification, customer profiles, addresses, guest checkout, guest-to-customer conversion, preferences.

Status: not started (Phase 1 laid the foundation below).

## Phase 1 foundation
- Schema: `supabase/migrations/0002_profiles_customers.sql`, `0003_customer_addresses.sql`.
- RLS: `supabase/migrations/0014_row_level_security.sql` (self-read/write policies + `is_admin()` helper).
- Deployable code home: `supabase/functions/auth/index.ts` — Phase 1 ships only an idempotent "ensure profile row exists for this JWT" endpoint, not full signup/login/reset flows (Phase 2).
