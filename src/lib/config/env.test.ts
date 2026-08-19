import { afterEach, describe, expect, it, vi } from 'vitest'

describe('client env config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('throws a clear, actionable error when Supabase env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { getSupabaseConfig } = await import('./env')
    expect(() => getSupabaseConfig()).toThrow(/VITE_SUPABASE_URL/)
  })

  it('does not throw on import — validation is lazy', async () => {
    // Importing the module alone (no call to getSupabaseConfig) must never throw,
    // otherwise a blank .env would break `npm run build`.
    await expect(import('./env')).resolves.toBeTruthy()
  })

  it('returns the configured Supabase client config when present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
    const { getSupabaseConfig, hasSupabaseConfig } = await import('./env')
    expect(hasSupabaseConfig()).toBe(true)
    expect(getSupabaseConfig()).toEqual({ url: 'https://example.supabase.co', anonKey: 'test-anon-key' })
  })

  it('hasSupabaseConfig returns false when unset, without throwing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { hasSupabaseConfig } = await import('./env')
    expect(hasSupabaseConfig()).toBe(false)
  })

  it('getAppConfig falls back to a sane default WhatsApp number', async () => {
    vi.stubEnv('VITE_WHATSAPP_SUPPORT_NUMBER', '')
    const { getAppConfig } = await import('./env')
    expect(getAppConfig().whatsappNumber).toBe('923079594474')
  })
})
