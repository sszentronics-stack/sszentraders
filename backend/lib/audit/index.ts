/**
 * Audit logging helper for the `audit_logs` table
 * (supabase/migrations/0013_idempotency_and_audit.sql). Every
 * privileged/security-sensitive Edge Function action should call
 * writeAuditLog(). Never pass passwords, API keys, tokens, or other secrets
 * in `metadata` — this module does not attempt to guess and scrub secret
 * fields the way backend/lib/logger does, because audit metadata is
 * expected to be a deliberate, minimal, reviewed payload.
 */

export type AuditActorType = 'customer' | 'admin' | 'system' | 'integration'

export interface AuditLogEntry {
  actor: string | null
  actorType: AuditActorType
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  ip?: string
  userAgent?: string
}

/**
 * Minimal shape of the Supabase client this helper needs — decoupled from
 * the concrete `@supabase/supabase-js` type so it can be unit-tested with a
 * fake and used from both the browser client and the Edge Function admin
 * client without a hard dependency here.
 */
export interface AuditLogWriter {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>
  }
}

const FORBIDDEN_METADATA_KEYS = ['password', 'token', 'secret', 'key', 'service_role', 'authorization']

export class AuditMetadataContainsSecretError extends Error {
  constructor(key: string) {
    super(`Refusing to write audit log: metadata key "${key}" looks like it may contain a secret.`)
    this.name = 'AuditMetadataContainsSecretError'
  }
}

function assertSafeMetadata(metadata?: Record<string, unknown>): void {
  if (!metadata) return
  for (const key of Object.keys(metadata)) {
    const lower = key.toLowerCase()
    if (FORBIDDEN_METADATA_KEYS.some((forbidden) => lower.includes(forbidden))) {
      throw new AuditMetadataContainsSecretError(key)
    }
  }
}

export async function writeAuditLog(client: AuditLogWriter, entry: AuditLogEntry): Promise<void> {
  assertSafeMetadata(entry.metadata)

  const { error } = await client.from('audit_logs').insert({
    actor: entry.actor,
    actor_type: entry.actorType,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
    ip: entry.ip ?? null,
    user_agent: entry.userAgent ?? null,
  })

  if (error) {
    throw new Error(`Failed to write audit log for action "${entry.action}": ${error.message}`)
  }
}
