# cart

**Phase:** 5

Guest + authenticated cart, cart merge on login, quantity/availability checks, wishlist, recently viewed, abandoned-cart foundation. Coupons/promotional pricing remain out of scope (Phase 13).

Status: implemented. Guest and authenticated identity both resolve to a `profiles.id` (guest = Supabase anonymous auth, scaffolded in Phase 2's `AuthContext.ensureGuestSession`, first consumed here) — see `supabase/functions/_shared/callerAuth.ts`.

- Pure business rules (merge math, price/availability revalidation, totals): `backend/lib/cart`.
- Cart read/write: `cart.service.ts`, called only from `supabase/functions/cart/index.ts`.
- Wishlist: `wishlist.service.ts`.
- Recently viewed (capped per profile): `recentlyViewed.service.ts`.
- Schema: `supabase/migrations/0017_cart_wishlist_recently_viewed.sql`.
- Frontend: `src/repositories/cart.repository.ts`, `src/repositories/wishlist.repository.ts`, `src/context/CartContext.jsx`, `src/context/WishlistContext.jsx`, `src/hooks/useRecentlyViewed.js`.

Every price/subtotal returned to the client is recomputed server-side from the live `product_variants` row on every read — never trusted from what the browser last saw. See `docs/phase-5-completion-report.md` for the full design writeup and known limitations.
