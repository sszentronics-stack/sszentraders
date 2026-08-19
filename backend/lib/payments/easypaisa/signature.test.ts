import { describe, expect, it } from 'vitest'
import { verifyWebhookSignature, __internal } from './signature.ts'

describe('verifyWebhookSignature (generic HMAC-SHA256 framework)', () => {
  const secret = 'test-webhook-secret'
  const rawBody = JSON.stringify({ orderId: 'order-1', status: 'paid', amount: 12900 })

  it('accepts a correctly computed signature', async () => {
    const signature = await __internal.hmacSha256Hex(secret, rawBody)
    await expect(verifyWebhookSignature({ secret, rawBody, providedSignatureHex: signature })).resolves.toBe(true)
  })

  it('is case-insensitive on the hex digest', async () => {
    const signature = await __internal.hmacSha256Hex(secret, rawBody)
    await expect(
      verifyWebhookSignature({ secret, rawBody, providedSignatureHex: signature.toUpperCase() }),
    ).resolves.toBe(true)
  })

  it('rejects a tampered body', async () => {
    const signature = await __internal.hmacSha256Hex(secret, rawBody)
    const tamperedBody = JSON.stringify({ orderId: 'order-1', status: 'paid', amount: 999999 })
    await expect(verifyWebhookSignature({ secret, rawBody: tamperedBody, providedSignatureHex: signature })).resolves.toBe(
      false,
    )
  })

  it('rejects a signature computed with the wrong secret', async () => {
    const signature = await __internal.hmacSha256Hex('wrong-secret', rawBody)
    await expect(verifyWebhookSignature({ secret, rawBody, providedSignatureHex: signature })).resolves.toBe(false)
  })

  it('rejects a missing signature', async () => {
    await expect(verifyWebhookSignature({ secret, rawBody, providedSignatureHex: null })).resolves.toBe(false)
    await expect(verifyWebhookSignature({ secret, rawBody, providedSignatureHex: undefined })).resolves.toBe(false)
  })

  it('rejects when no secret is configured', async () => {
    const signature = await __internal.hmacSha256Hex('anything', rawBody)
    await expect(verifyWebhookSignature({ secret: '', rawBody, providedSignatureHex: signature })).resolves.toBe(false)
  })

  it('constant-time comparison treats equal-length mismatches and length mismatches both as false', () => {
    expect(__internal.constantTimeEquals('abcd', 'abce')).toBe(false)
    expect(__internal.constantTimeEquals('abcd', 'abcde')).toBe(false)
    expect(__internal.constantTimeEquals('abcd', 'abcd')).toBe(true)
  })
})
