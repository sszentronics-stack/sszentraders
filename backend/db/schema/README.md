# schema

**Phase:** 1

Table/entity definitions: customers, products, categories, brands, variants, orders, payments, deliveries, returns, promotions, local accounting, ERP sync state.

Status: **implemented**, expressed as SQL DDL directly inside the ordered migrations at `supabase/migrations/` rather than as separate standalone schema files (a single source of truth avoids the schema and the migrations drifting apart). See `docs/phase-1-backend-foundation.md` for the ER overview.
