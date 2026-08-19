import { describe, expect, it } from 'vitest'
import { __internal } from './index.ts'

describe('logger redaction', () => {
  it('redacts keys that look like secrets', () => {
    const result = __internal.redact({
      apiKey: 'super-secret',
      SUPABASE_SERVICE_ROLE_KEY: 'abc.def.ghi',
      password: 'hunter2',
      authorization: 'Bearer xyz',
      hashKey: 'abc123',
      orderId: 'order-1',
    }) as Record<string, unknown>

    expect(result.apiKey).toBe('[REDACTED]')
    expect(result.SUPABASE_SERVICE_ROLE_KEY).toBe('[REDACTED]')
    expect(result.password).toBe('[REDACTED]')
    expect(result.authorization).toBe('[REDACTED]')
    expect(result.hashKey).toBe('[REDACTED]')
    expect(result.orderId).toBe('order-1')
  })

  it('redacts nested secret-like keys', () => {
    const result = __internal.redact({
      config: { easypaisaHashKey: 'secret', merchantId: 'ok' },
    }) as { config: Record<string, unknown> }

    expect(result.config.easypaisaHashKey).toBe('[REDACTED]')
    expect(result.config.merchantId).toBe('ok')
  })
})
