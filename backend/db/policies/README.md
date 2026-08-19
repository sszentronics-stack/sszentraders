# policies

**Phase:** 1

Row Level Security policies.

Status: **implemented** at `supabase/migrations/0014_row_level_security.sql` and `0015_storage_buckets.sql` (table RLS + storage bucket policies), kept alongside the rest of the migration set rather than split out separately, so RLS never drifts out of sync with the tables it protects.
