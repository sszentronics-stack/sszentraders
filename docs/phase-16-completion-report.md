# Phase 16 — Production Hardening, SEO & Final Web QA

Final phase of the Sprint-1 web roadmap. Cross-cutting: no new `backend/services`
area, no new database schema. Scope was SEO, resilience, deploy readiness for
Hostinger static hosting, and a regression pass across every phase merged
before this one (1–15).

## Critical fix: `callEdgeFunction` envelope-unwrapping bug

While doing the final QA pass, found that `src/lib/supabase/functions.ts`'s
`callEdgeFunction<T>()` returned the raw `client.functions.invoke()` payload
cast as `T`, without unwrapping it. Every Edge Function in this project
returns `backend/lib/response`'s standard envelope on success —
`{ ok: true, data: T }` (see `okResponse` in `supabase/functions/_shared/http.ts`)
— never the bare payload. That means **every repository call across every
phase (2 through 15)** was actually receiving `{ ok: true, data: {...} }`
cast as the flat type `T`; every `.field` access on the result would read
`undefined` against a real Edge Function invocation.

This was never caught during any prior phase because no live Supabase
project exists in this dev environment to exercise a real Edge Function
round trip end-to-end — only pure `backend/lib` logic gets real unit test
coverage, and `callEdgeFunction` itself has no test (it's a thin I/O shell).
TypeScript couldn't catch it either: `data as T` is an explicit unchecked
cast, exactly the kind of hole that lets a shape mismatch through silently.

**Fixed** in the single shared call site (`callEdgeFunction`) by importing
the already-canonical `SuccessEnvelope<T>` type from `backend/lib/response`
and unwrapping `.data` when the response matches that shape — corrects
every repository across every phase retroactively, with no per-file changes
needed. Confirmed no repository was working around the bug with a manual
`.data.data` unwrap (would have produced a compile error post-fix — `tsc`
stayed clean). Full `lint`/`typecheck`/`test`/`build` all pass after the fix.

This is the most consequential single change in this phase — arguably in
the whole project to date — since it was a live, silent correctness bug on
`main` affecting every admin and customer write/read path that goes through
an Edge Function, the moment a real Supabase project is connected.

## SEO

- **`src/hooks/useSeo.js`** — new lightweight per-page SEO hook. No
  `react-helmet` dependency added (none existed, and this is a
  client-only SPA with no SSR, so a heavier head-management library buys
  nothing); a `useEffect` that writes `document.title` + `<meta
  name="description">` / Open Graph / Twitter Card tags / canonical
  `<link>`, with cleanup on unmount, is sufficient. `noindex` option adds
  `<meta name="robots" content="noindex, nofollow">` for private surfaces.
- **`useJsonLd`** — companion hook injecting a `<script
  type="application/ld+json">` block, removed on unmount/change.
- Wired into: `Home` (title/description + `Organization` JSON-LD), `Shop`,
  `Product` (title/description/OG image from the product's first photo +
  `Product` JSON-LD with `Offer`/price/availability), `About`, `Contact`.
- `noindex` applied to `AccountLayout`, `AdminLayout`, `Cart`, `Checkout`,
  `Login`, `Register` — private/functional surfaces that shouldn't be
  indexed or that would otherwise show a stale/misleading snippet.
- **`NotFound` page** (see hardening below) also gets its own `noindex`'d
  title.
- **`public/robots.txt`** — allows everything except `/account`, `/admin`,
  `/checkout`, `/cart`, `/order-confirmation`; points to `/sitemap.xml`.
- **`public/sitemap.xml`** — static routes only (home, shop, about,
  contact, policy pages). Product detail pages (`/products/:slug`) are
  backend-driven and this dev environment has no live Supabase project to
  enumerate the published catalog from at build time, so they're
  deliberately **not** included — documented in the file itself with the
  two real options for going live (a build-time script querying
  `products` where `status='published'`, or a dynamic Edge-Function-served
  sitemap). The placeholder host (`https://www.aurabeautycare.pk`) needs
  to be swapped for the real production domain before deploying.

## Production hardening

- **`src/components/ErrorBoundary.jsx`** — a React class component
  error boundary wrapping `<App />` in `main.jsx`. Previously any uncaught
  render error anywhere in the tree unmounted the whole app to a blank
  white page (React's default behavior with no boundary). Now it shows a
  recoverable message in the existing visual language and logs the error
  to the console (no error-tracking service is configured in this
  environment — no Sentry/etc credentials exist — so console is the
  honest fallback rather than silently swallowing it).
- **`src/pages/NotFound.jsx`** — a real 404 page. The storefront's
  catch-all route previously blind-redirected unmatched paths to `/`
  (`<Navigate to="/" replace />`), which returns a 200 for a broken link —
  a "soft 404" that gives neither the visitor nor a search engine any
  signal something was wrong. `App.jsx`'s catch-all inside the `Layout`
  route now renders `NotFound` (keeping Header/Footer/CartDrawer) instead.
  Removed the now-unreachable top-level `<Route path="*" ...>` that sat
  outside both the storefront and admin route trees (the `Layout` route's
  own catch-all already covers every non-`/admin` path; React Router
  ranks `/admin`'s static segment above a sibling splat).
- **`public/.htaccess`** — Hostinger/Apache config (copied into `dist/` by
  Vite's `public/` passthrough): SPA fallback rewrite (any unmatched
  path serves `index.html` so a hard refresh on e.g. `/shop` doesn't 404
  at the Apache level — this app has zero server-side routes), security
  headers (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`), long-lived caching for
  Vite's content-hashed JS/CSS/image assets with `index.html` forced to
  `no-cache` (so a redeploy is always picked up), and gzip compression.
- **Admin console code-splitting.** The production build was tripping
  Vite's 500kB chunk-size warning: the entire `/admin/*` console — every
  page across catalog, orders, customers, payments, shipments, returns,
  reviews, ERP sync, inventory, reports, promotions, settings, and audit
  log — was bundled eagerly into the same chunk every storefront visitor
  downloaded, even though none of it is reachable without an admin
  session. Converted every admin route element in `App.jsx` to
  `React.lazy()` behind one `<Suspense>` boundary around `AdminLayout`
  (covers its `<Outlet>`-rendered children too, since they mount as
  descendants of the same boundary). Main bundle: **779KB → 467KB**
  (gzip 208KB → 135KB), admin console now split into ~30 small
  route-level chunks fetched on first `/admin` navigation. No more
  chunk-size warning on `npm run build`.

## Final Web QA

Traced the critical flows against the current merged `main` for obvious
breakage:
- Storefront browse → product detail → cart → checkout → order
  confirmation (Phases 3–6, 9).
- Auth: login/register/forgot/reset password, protected `/account/*`
  routes (Phase 2).
- Account: profile, addresses, orders, returns/request-return, wishlist,
  loyalty (Phases 5, 14, 13).
- Admin: dashboard, catalog manager, orders, customers, payments,
  shipments, returns, reviews, ERP sync, inventory, reports, promotions,
  settings, audit log — all routes resolve, all now lazy-loaded behind
  `RequireAdmin` (Phases 12, 13, 15).
- Confirmed `public/robots.txt` / `sitemap.xml` / `.htaccess` all copy
  through into `dist/` on build.
- Confirmed no repository anywhere was already working around the
  envelope bug with a manual double-unwrap that the fix above would have
  broken.

No other correctness issues found in this pass; the envelope bug above was
the one significant finding.

## Validation

```
npm run lint       # 0 errors — same pre-existing warnings as before this phase, none new
npm run typecheck  # 0 errors
npm run test        # 44 files, 401 tests passed
npm run build        # succeeds, no chunk-size warning (previously present)
```

## Known limitations / deliberate non-goals

- `public/sitemap.xml` lists static routes only — see the SEO section
  above for why, and the two documented options for a dynamic version at
  deploy time.
- No server-side rendering / pre-rendering: this stays a client-rendered
  SPA per the existing architecture. SEO here is the ceiling achievable
  without introducing SSR, which was never in scope for Sprint 1.
- No real error-tracking/monitoring service (Sentry, etc.) is wired up —
  no credentials exist in this environment. `ErrorBoundary` logs to the
  console; wiring a real provider is a config-only follow-up once
  credentials exist.
- Security headers are set via Hostinger's `.htaccess` (`mod_headers`),
  which assumes the target Hostinger plan has that module enabled (true
  for standard shared hosting). If deployed elsewhere, the equivalent
  headers need to be set at that host's config layer instead.
- This phase does not re-audit RLS policies, Edge Function auth checks, or
  the integration "never fake success" behavior established in Phases 7–11
  and 14 — those were validated in their own phase's completion report and
  are unchanged here.

## Sprint 1 status

This closes the web roadmap: Phases 1–16 are now complete on `main`.
Sprint 2 (Flutter mobile app, `apps/mobile`) has not been started.
