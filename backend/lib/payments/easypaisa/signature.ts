/**
 * Easypaisa webhook signature verification — GENERIC BEST-GUESS FRAMEWORK.
 *
 * No real Easypaisa API documentation or credentials are available in this
 * project (see docs/phase-10-completion-report.md). This module implements
 * the overwhelmingly common webhook-verification pattern for payment
 * gateways — an HMAC-SHA256 digest of the raw request body, keyed by a
 * shared merchant secret, compared in constant time — so the surrounding
 * callback-handling architecture (idempotency, state machine, audit trail)
 * has something real to call. It is explicitly NOT confirmed against
 * Easypaisa's actual webhook contract (header name, digest encoding,
 * canonicalization of fields, etc.), which is unknown without their docs.
 *
 * Before going live, whoever has access to real Easypaisa merchant
 * integration docs MUST verify/replace:
 *   - the exact header the signature arrives in (assumed here to be a
 *     single hex-encoded HMAC-SHA256 digest, e.g. `X-Easypaisa-Signature`),
 *   - whether the digest is computed over the raw JSON body, a
 *     specific ordered field concatenation, or form-encoded data,
 *   - the hash algorithm and encoding (assumed SHA-256 + lowercase hex).
 *
 * Never change this module to skip verification or to accept an unsigned
 * payload as valid "for now" — an unverified callback must never be able
 * to mark an order paid.
 */

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Constant-time string comparison — never use `===` for secret/signature comparison. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still walk a fixed-length buffer so the early return above doesn't
    // itself leak length via timing for the (rare, low-value) case of a
    // length mismatch — the dominant timing signal to protect is
    // byte-by-byte content comparison of equal-length strings.
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export interface VerifyWebhookSignatureInput {
  secret: string
  rawBody: string
  providedSignatureHex: string | null | undefined
}

/**
 * Verify a webhook's HMAC-SHA256 signature in constant time. Returns false
 * (never throws on a bad signature) so callers can uniformly treat "missing
 * secret", "missing signature header", and "signature mismatch" as the same
 * "reject, do not apply" outcome.
 */
export async function verifyWebhookSignature(input: VerifyWebhookSignatureInput): Promise<boolean> {
  const { secret, rawBody, providedSignatureHex } = input
  if (!secret || !providedSignatureHex) return false
  const expected = await hmacSha256Hex(secret, rawBody)
  return constantTimeEquals(expected.toLowerCase(), providedSignatureHex.trim().toLowerCase())
}

/** Exposed for tests and for building the expected header value in integration tooling. */
export const __internal = { hmacSha256Hex, constantTimeEquals }
