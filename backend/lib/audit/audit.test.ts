import { describe, expect, it } from 'vitest'
import { AuditMetadataContainsSecretError, writeAuditLog, type AuditLogWriter } from './index.ts'

function fakeClient(): AuditLogWriter & { inserted: Record<string, unknown>[] } {
  const inserted: Record<string, unknown>[] = []
  return {
    inserted,
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row)
        return { error: null }
      },
    }),
  }
}

describe('writeAuditLog', () => {
  it('inserts a normalized row', async () => {
    const client = fakeClient()
    await writeAuditLog(client, {
      actor: 'profile-1',
      actorType: 'customer',
      action: 'order.status_changed',
      entityType: 'order',
      entityId: 'order-1',
      metadata: { fromStatus: 'pending', toStatus: 'confirmed' },
    })
    expect(client.inserted[0]).toMatchObject({
      actor: 'profile-1',
      actor_type: 'customer',
      action: 'order.status_changed',
      entity_type: 'order',
      entity_id: 'order-1',
    })
  })

  it('refuses to write metadata that looks like it contains a secret', async () => {
    const client = fakeClient()
    await expect(
      writeAuditLog(client, {
        actor: null,
        actorType: 'system',
        action: 'integration.call',
        metadata: { apiKey: 'should-not-be-here' },
      }),
    ).rejects.toBeInstanceOf(AuditMetadataContainsSecretError)
    expect(client.inserted).toHaveLength(0)
  })

  it('surfaces a clear error if the insert fails', async () => {
    const client: AuditLogWriter = {
      from: () => ({ insert: async () => ({ error: { message: 'db down' } }) }),
    }
    await expect(
      writeAuditLog(client, { actor: null, actorType: 'system', action: 'x' }),
    ).rejects.toThrow(/db down/)
  })
})
