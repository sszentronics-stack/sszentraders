# auth (backend/lib)

**Phase:** 2

Runtime-agnostic identity business logic used by `supabase/functions/auth/index.ts`
(and reusable by future Edge Functions / the Flutter app's backend calls):

| File | Responsibility |
|---|---|
| `linking.ts` | `ensureCustomerForProfile()` — the single authoritative "link or create a `customers` row for an authenticated `profiles` row" logic, with dedup-by-email/phone against existing guest customers so registration never creates a duplicate customer record. |
| `authorization.ts` | `assertOwnsResource()` / `assertOwnsCustomerResource()` — defense-in-depth ownership checks for any Edge Function using the service-role client (which bypasses RLS). RLS (see `supabase/migrations/0014_row_level_security.sql`) is the primary boundary; these helpers are the second layer for privileged code paths. |
| `customerLookup.ts` | `findCustomersByEmailOrPhone()` — admin-safe lookup used by (future) admin tooling. Not a UI; Phase 12 builds the Admin Customer module UI on top of this. |

All three are dependency-injected (plain async functions, not a Supabase
client) so the business logic is unit-testable without mocking Supabase's
fluent query builder — see the `*.test.ts` files next to each module. The
Deno Edge Function wires real Supabase calls into these interfaces.
