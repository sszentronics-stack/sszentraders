import { describe, expect, it } from 'vitest'
import { LedGixWebhookSecretNotConfiguredError, verifyLedGixWebhookSignature } from './webhook'

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

describe('verifyLedGixWebhookSignature', () => {
  const secret = 'top-secret'
  const rawBody = JSON.stringify({ event: 'invoice.paid', ledgixInvoiceId: 'inv-1' })

  it('accepts a correctly signed body', async () => {
    const signatureHeader = await hmacSha256Hex(secret, rawBody)
    await expect(verifyLedGixWebhookSignature({ rawBody, signatureHeader, secret })).resolves.toBe(true)
  })

  it('accepts a signature with an sha256= prefix', async () => {
    const signatureHeader = `sha256=${await hmacSha256Hex(secret, rawBody)}`
    await expect(verifyLedGixWebhookSignature({ rawBody, signatureHeader, secret })).resolves.toBe(true)
  })

  it('rejects a tampered body', async () => {
    const signatureHeader = await hmacSha256Hex(secret, rawBody)
    const tampered = JSON.stringify({ event: 'invoice.paid', ledgixInvoiceId: 'inv-2' })
    await expect(verifyLedGixWebhookSignature({ rawBody: tampered, signatureHeader, secret })).resolves.toBe(false)
  })

  it('rejects a signature produced with the wrong secret', async () => {
    const signatureHeader = await hmacSha256Hex('wrong-secret', rawBody)
    await expect(verifyLedGixWebhookSignature({ rawBody, signatureHeader, secret })).resolves.toBe(false)
  })

  it('rejects a missing signature header without throwing', async () => {
    await expect(verifyLedGixWebhookSignature({ rawBody, signatureHeader: null, secret })).resolves.toBe(false)
  })

  it('fails closed with a dedicated error when no secret is configured', async () => {
    await expect(
      verifyLedGixWebhookSignature({ rawBody, signatureHeader: 'anything', secret: '' }),
    ).rejects.toBeInstanceOf(LedGixWebhookSecretNotConfiguredError)
  })
})
