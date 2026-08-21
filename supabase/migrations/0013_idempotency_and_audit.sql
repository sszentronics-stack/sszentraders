-- 0013_idempotency_and_audit.sql
-- Idempotency keys: foundation for safe retries of order creation, refunds,
-- and future Easypaisa/ERP/Leopards callbacks.
-- Audit logs: append-only trail of sensitive actions. Never store
-- passwords/secrets/tokens here.

create table idempotency_keys (
  key text primary key,
  scope text not null,                 -- e.g. 'order.create', 'payment.easypaisa.webhook', 'erp.sync'
  request_hash text not null,          -- hash of the normalized request payload, to detect key reuse with different input
  response_reference text,             -- e.g. the created order id, stored once the operation completes
  status text not null default 'pending', -- 'pending' | 'completed' | 'failed'
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_idempotency_keys_scope on idempotency_keys (scope);
create index idx_idempotency_keys_expires_at on idempotency_keys (expires_at);

comment on table idempotency_keys is 'Generic idempotency ledger. Callers supply a client-generated key per logical operation; see backend/lib/idempotency for the helper.';

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor uuid,                          -- profiles.id or null for system/anonymous actions
  actor_type text not null default 'system', -- 'customer' | 'admin' | 'system' | 'integration'
  action text not null,                -- e.g. 'order.status_changed', 'auth.login', 'admin.product_updated'
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_audit_logs_actor on audit_logs (actor);
create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index idx_audit_logs_created_at on audit_logs (created_at);
create index idx_audit_logs_action on audit_logs (action);

comment on table audit_logs is 'Append-only audit trail. Never store passwords, API keys, tokens, or other secrets in metadata — see backend/lib/audit.';
