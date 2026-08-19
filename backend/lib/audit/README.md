# audit

**Phase:** 1

Audit logging for financial and security-sensitive actions across all services.

Status: **implemented** at `index.ts` (`writeAuditLog()`, backed by the `audit_logs` table — see `supabase/migrations/0013_idempotency_and_audit.sql`) with tests in `audit.test.ts`. Refuses to write metadata keys that look like secrets.
