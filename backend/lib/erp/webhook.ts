/**
 * LedGix ERP webhook/callback authenticity verification — Phase 8.
 *
 * We do not have real LedGix webhook documentation, and it is not even
 * confirmed that LedGix sends webhooks at all (it may be poll-only, e.g.
 * via getInventorySnapshot). Per the project's "do not invent external API
 * behaviour" rule, this is explicitly a BEST-GUESS generic HMAC-SHA256
 * verification function, following the EXACT SAME pattern Phase 10
 * (Easypaisa, backend/lib/payments/easypaisa/signature.ts) and Phase 11
 * (Leopards, backend/services/delivery/leopards/webhook.ts) already use for
 * their own callback verification — a shared secret + HMAC-SHA256 over the
 * raw request body, hex-encoded, compared in constant time, read from a
 * provider-named signature header. If real LedGix docs describe a
 * different scheme (different algorithm, a signed query string, no
 * webhooks at all), only this file needs to change — callers
 * (supabase/functions/integrations-ledgix/index.ts) only depend on this
 * function's boolean result.
 *
 * Uses SubtleCrypto so it runs unmodified in both Deno (Edge Functions) and
 * Node (Vitest), matching the sibling Easypaisa/Leopards modules.
 */

export interface VerifyLedGixWebhookSignatureInput {
  /** The exact raw request body bytes/string as received — never a re-serialized/parsed-then-stringified copy. */
  rawBody: string
  /** The signature header value as sent by LedGix, e.g. `X-LedGix-Signature` (best-guess header name pending real docs). */
  signatureHeader: string | null
  /** Shared webhook secret (LEDGIX_WEBHOOK_SECRET), server-side only. */
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

export class LedGixWebhookSecretNotConfiguredError extends Error {
  constructor() {
    super('LEDGIX_WEBHOOK_SECRET is not configured — cannot verify webhook authenticity.')
    this.name = 'LedGixWebhookSecretNotConfiguredError'
  }
}

/**
 * Returns true only if `signatureHeader` matches the HMAC-SHA256 of
 * `rawBody` under `secret`. Throws LedGixWebhookSecretNotConfiguredError if
 * no secret is configured (never silently "verifies" without one) and
 * returns false (never throws) for a missing/malformed header, so callers
 * can uniformly respond 401 without a separate null-check.
 */
export async function verifyLedGixWebhookSignature(input: VerifyLedGixWebhookSignatureInput): Promise<boolean> {
  if (!input.secret) throw new LedGixWebhookSecretNotConfiguredError()
  if (!input.signatureHeader) return false

  const expected = await hmacSha256Hex(input.secret, input.rawBody)
  const provided = input.signatureHeader.trim().toLowerCase().replace(/^sha256=/, '')
  return timingSafeEqual(expected, provided)
}
