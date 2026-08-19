# db

**Phase:** 1

Supabase/PostgreSQL schema, migrations, and RLS/security policies for customers, products, categories, brands, variants, orders, payments, deliveries, returns, promotions.

Status: **implemented.** The actual SQL lives at `supabase/migrations/` (Supabase CLI standard location) and `supabase/seed.sql` (dev-only seed data) — see that folder and `docs/phase-1-backend-foundation.md` for the full schema, ER overview, and apply instructions. The `migrations/`, `schema/`, and `policies/` subfolders here are kept as pointers to avoid two divergent copies of the same SQL.
