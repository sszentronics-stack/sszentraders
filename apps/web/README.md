# web

**Phase:** 4 (+ ongoing)

Existing Vite + React storefront app. Theme/visual identity must be preserved. Product/pricing/promo data must come from the backend, never hard-coded.

Status: **decision made in Phase 1 — stays at the repo root.** The working Vite + React storefront (`index.html`, `src/`, `vite.config.js`, `package.json`) remains at the repo root, not here. Moving a live, deploy-tested Hostinger static build into `apps/web/` mid-Phase-1 would be a pure-risk refactor with no functional benefit right now (no other app shares this repo's build tooling yet), so it was deliberately deferred rather than done "just because the folder exists." This folder stays an empty placeholder until a real multi-app reason to move it appears (e.g. a monorepo tool once `apps/admin` gets real code in Phase 12).

New Phase 1 backend code the storefront will eventually consume (once wired in a later phase) lives at the repo root under `src/lib/`, `src/repositories/`, and `supabase/` — see `docs/phase-1-backend-foundation.md`.

**Phase 3 update:** the storefront is now wired to this backend code — see `docs/phase-3-completion-report.md`. `src/hooks/useCatalog.js` loads products via `src/repositories/products.repository.ts` (mapped through `src/data/catalogAdapter.ts`) when Supabase is configured, and falls back to the static dataset in `src/data/products.js` otherwise (or on error), so the site never crashes without a live Supabase project.
