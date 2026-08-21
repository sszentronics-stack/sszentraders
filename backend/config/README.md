# config

**Phase:** 1

Centralized environment configuration. Blank values only, no real secrets ever committed.

Status: **implemented.**

- **Authoritative template:** the repo-root `.env.example` is the single source of truth for every environment variable name in the project (client-safe `VITE_*` for the Vite app, server-only for Edge Functions). `backend/config/.env.example` used to duplicate this; it has been replaced with a short pointer to avoid the two ever drifting apart (see that file).
- **Client-safe config module:** `src/lib/config/env.ts` — the only place the Vite app reads `import.meta.env`.
- **Server-only config module:** `supabase/functions/_shared/config.ts` — the only place Edge Functions read `Deno.env.get`.
- Real per-environment values go in `.env.local` (Vite dev, gitignored) and `supabase secrets set` (Edge Functions) — never committed.
