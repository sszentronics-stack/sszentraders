import { describe, expect, it } from 'vitest'
import { getErpHealthStatus } from './health.service.ts'
import { FakeSupabaseClient } from './testUtils.ts'

function asSupabase(db: FakeSupabaseClient) {
  return db as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('getErpHealthStatus', () => {
  it('reports configured: false when no config is present, and leaks no credential values', async () => {
    const db = new FakeSupabaseClient()
    const status = await getErpHealthStatus(asSupabase(db), null)
    expect(status).toEqual({ provider: 'ledgix', configured: false, pendingSyncCount: 0 })
    expect(JSON.stringify(status)).not.toMatch(/apiKey|companyId/i)
  })

  it('reports configured: true when a full config is present, still without echoing it back', async () => {
    const db = new FakeSupabaseClient()
    const status = await getErpHealthStatus(asSupabase(db), {
      apiBaseUrl: 'https://example.test',
      apiKey: 'super-secret-key',
      companyId: 'company-1',
    })
    expect(status.configured).toBe(true)
    expect(JSON.stringify(status)).not.toContain('super-secret-key')
  })

  it('reports configured: false when the config object is missing a required field', async () => {
    const db = new FakeSupabaseClient()
    const status = await getErpHealthStatus(asSupabase(db), { apiBaseUrl: 'https://example.test', apiKey: '', companyId: 'c1' })
    expect(status.configured).toBe(false)
  })

  it('counts pending/in_progress/failed ledgix sync jobs only', async () => {
    const db = new FakeSupabaseClient()
    db.seed('erp_sync_jobs', [
      { id: 'j1', provider: 'ledgix', status: 'pending' },
      { id: 'j2', provider: 'ledgix', status: 'failed' },
      { id: 'j3', provider: 'ledgix', status: 'succeeded' },
      { id: 'j4', provider: 'ledgix', status: 'in_progress' },
    ])
    const status = await getErpHealthStatus(asSupabase(db), null)
    expect(status.pendingSyncCount).toBe(3)
  })
})
