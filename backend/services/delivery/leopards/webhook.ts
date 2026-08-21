/**
 * Leopards webhook/callback authenticity verification — Phase 11.
 *
 * We do not have real Leopards webhook documentation (whether they send
 * webhooks at all, what header carries the signature, or what signing
 * scheme they use). Per the project's "do not invent external API
 * behaviour" rule, this is explicitly a BEST-GUESS generic HMAC-SHA256
 * verification function, following the exact same pattern Phase 10
 * (Easypaisa) uses for its callback verification — a standard,
 * provider-agnostic shape most Pakistani payment/courier webhooks follow
 * (shared secret + HMAC over the raw request body, hex-encoded, in a
 * signature header). If real Leopards docs describe a different scheme
 * (e.g. a different hash algorithm, a signed query string instead of body,
 * or no webhooks at all — polling-only), only this function needs to
 * change; callers (supabase/functions/integrations-leopards/index.ts) only
 * depend on its boolean result.
 *
 * Uses SubtleCrypto so it runs unmodified in both Deno (Edge Functions) and
 * Node (Vitest), matching backend/lib/idempotency's existing convention.
 */

export interface VerifyWebhookSignatureInput {
  /** The exact raw request body bytes/string as received — never a re-serialized/parsed-then-stringified copy, which could change byte-for-byte and invalidate a real signature. */
  rawBody: string
  /** The signature header value as sent by the provider, e.g. `X-Leopards-Signature` (best-guess header name pending real docs). */
  signatureHeader: string | null
  /** Shared webhook secret (LEOPARDS_WEBHOOK_SECRET), server-side only. */
  secret: string
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const keyData = new TextEncoder().encode(secret)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Constant-time string comparison so signature checks don't leak timing information. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export class WebhookSecretNotConfiguredError extends Error {
  constructor() {
    super('LEOPARDS_WEBHOOK_SECRET is not configured — cannot verify webhook authenticity.')
    this.name = 'WebhookSecretNotConfiguredError'
  }
}

/**
 * Returns true only if `signatureHeader` matches the HMAC-SHA256 of
 * `rawBody` under `secret`. Throws WebhookSecretNotConfiguredError if no
 * secret is configured (never silently "verifies" without a secret) and
 * returns false (never throws) for a missing/malformed header, so callers
 * can uniformly respond 401 without a separate null-check.
 */
export async function verifyLeopardsWebhookSignature(input: VerifyWebhookSignatureInput): Promise<boolean> {
  if (!input.secret) throw new WebhookSecretNotConfiguredError()
  if (!input.signatureHeader) return false

  const expected = await hmacSha256Hex(input.secret, input.rawBody)
  const provided = input.signatureHeader.trim().toLowerCase().replace(/^sha256=/, '')
  return timingSafeEqual(expected, provided)
}
