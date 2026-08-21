import { describe, expect, it } from 'vitest'
import { verifyLeopardsWebhookSignature, WebhookSecretNotConfiguredError } from './webhook.ts'

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

describe('verifyLeopardsWebhookSignature (best-guess HMAC scheme, pending real Leopards docs)', () => {
  it('accepts a correctly signed body', async () => {
    const secret = 'test-secret'
    const body = JSON.stringify({ tracking_number: 'LP123', status: 'delivered' })
    const signature = await sign(secret, body)
    await expect(verifyLeopardsWebhookSignature({ rawBody: body, signatureHeader: signature, secret })).resolves.toBe(true)
  })

  it('accepts a "sha256=" prefixed header (a common convention)', async () => {
    const secret = 'test-secret'
    const body = '{"a":1}'
    const signature = await sign(secret, body)
    await expect(
      verifyLeopardsWebhookSignature({ rawBody: body, signatureHeader: `sha256=${signature}`, secret }),
    ).resolves.toBe(true)
  })

  it('rejects a tampered body', async () => {
    const secret = 'test-secret'
    const signature = await sign(secret, '{"a":1}')
    await expect(
      verifyLeopardsWebhookSignature({ rawBody: '{"a":2}', signatureHeader: signature, secret }),
    ).resolves.toBe(false)
  })

  it('rejects a signature produced with the wrong secret', async () => {
    const body = '{"a":1}'
    const signature = await sign('wrong-secret', body)
    await expect(
      verifyLeopardsWebhookSignature({ rawBody: body, signatureHeader: signature, secret: 'right-secret' }),
    ).resolves.toBe(false)
  })

  it('rejects a missing signature header without throwing', async () => {
    await expect(
      verifyLeopardsWebhookSignature({ rawBody: '{}', signatureHeader: null, secret: 'test-secret' }),
    ).resolves.toBe(false)
  })

  it('throws WebhookSecretNotConfiguredError when no secret is set, rather than silently passing verification', async () => {
    await expect(verifyLeopardsWebhookSignature({ rawBody: '{}', signatureHeader: 'abc', secret: '' })).rejects.toBeInstanceOf(
      WebhookSecretNotConfiguredError,
    )
  })
})
