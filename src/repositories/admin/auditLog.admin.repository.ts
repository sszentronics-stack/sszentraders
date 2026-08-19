/**
 * Admin audit-log viewer — direct RLS-scoped read (`audit_logs_admin_all`,
 * 0014_row_level_security.sql). Read-only, append-only table; no write path
 * needed here (writes happen server-side via backend/lib/audit inside each
 * Edge Function's own mutation handlers).
 */
import { getSupabaseBrowserClient } from '../../lib/supabase/client'

export interface AuditLogEntry {
  id: string
  actor: string | null
  actorType: string
  action: string
  entityType: string | null
  entityId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export async function listAuditLogs(params: { action?: string; entityType?: string; actorType?: string; limit?: number; offset?: number } = {}): Promise<{ items: AuditLogEntry[]; total: number }> {
  const client = getSupabaseBrowserClient()
  const limit = params.limit ?? 50
  const offset = params.offset ?? 0
  let query = client
    .from('audit_logs')
    .select('id, actor, actor_type, action, entity_type, entity_id, metadata, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (params.action) query = query.ilike('action', `%${params.action}%`)
  if (params.entityType) query = query.eq('entity_type', params.entityType)
  if (params.actorType) query = query.eq('actor_type', params.actorType)

  const { data, error, count } = await query
  if (error) throw new Error(`Failed to list audit logs: ${error.message}`)
  const items = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    actor: row.actor,
    actorType: row.actor_type,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  }))
  return { items, total: count ?? items.length }
}
