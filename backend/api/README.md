# api

**Phase:** 1 (+ ongoing)

API/route layer exposed to `apps/web`, `apps/admin`, and the Sprint 2 `apps/mobile` client. All apps consume the same commerce backend.

Status: **implemented as Supabase Edge Functions**, not a Next.js/Node API layer — the project is Vite + static Hostinger hosting, with no persistent Node server available (see the hosting constraint in `docs/PHASE_PLAN.md`). The deployable code lives at `supabase/functions/*`; this folder documents the mapping rather than holding code itself:

| Edge Function | Maps to |
|---|---|
| `auth` | `backend/services/auth` |
| `products` | `backend/services/products`, `backend/services/catalog` |
| `orders` | `backend/services/orders` |
| `payments` | `backend/services/payments/easypaisa` |
| `shipments` | `backend/services/delivery/leopards` |
| `returns` | `backend/services/reviews` (returns half) |
| `accounting` | `backend/services/accounting` |
| `integrations-ledgix` | `backend/services/erp/ledgix` |
| `integrations-easypaisa` | `backend/services/payments/easypaisa` |
| `integrations-leopards` | `backend/services/delivery/leopards` |

Public, RLS-safe reads (published products/brands/categories/collections) skip this layer entirely and go straight from the Vite app to Supabase via `src/repositories/*` — see `docs/phase-1-backend-foundation.md`.

Both `apps/web` (Vite) today and the future `apps/mobile` (Flutter, Sprint 2) call these same Edge Functions / Supabase REST+RLS — nothing here is physically coupled to React.
