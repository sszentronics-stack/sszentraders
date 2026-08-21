/**
 * Idempotency helper — pairs with the `idempotency_keys` table
 * (supabase/migrations/0013_idempotency_and_audit.sql).
 *
 * Foundation for safe retries of order creation, refunds, and future
 * Easypaisa/ERP/Leopards callbacks. This module is transport/runtime
 * agnostic: it computes the request hash and the row shape to
 * upsert/check, but does not talk to Postgres directly — callers (Edge
 * Functions) pass in their own Supabase client.
 */

export interface IdempotencyRecord {
  key: string
  scope: string
  requestHash: string
  responseReference: string | null
  status: 'pending' | 'completed' | 'failed'
  expiresAt: string
}

/**
 * Deterministically hash a request payload so we can detect a client
 * reusing the same idempotency key with different input (a client bug or a
 * potential replay), which must be rejected rather than silently served.
 *
 * Uses SubtleCrypto (available in both the browser and Deno's Edge Function
 * runtime) so this module has zero Node-only dependencies.
 */
export async function hashRequestPayload(payload: unknown): Promise<string> {
  const json = JSON.stringify(sortKeysDeep(payload))
  const bytes = new TextEncoder().encode(json)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

export class IdempotencyKeyReusedWithDifferentPayloadError extends Error {
  constructor(key: string) {
    super(`Idempotency key "${key}" was already used with a different request payload`)
    this.name = 'IdempotencyKeyReusedWithDifferentPayloadError'
  }
}

export interface BuildIdempotencyRecordInput {
  key: string
  scope: string
  payload: unknown
  ttlMs?: number
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Build the row to upsert into idempotency_keys before starting an operation. */
export async function buildPendingIdempotencyRecord(
  input: BuildIdempotencyRecordInput,
): Promise<IdempotencyRecord> {
  const requestHash = await hashRequestPayload(input.payload)
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS
  return {
    key: input.key,
    scope: input.scope,
    requestHash,
    responseReference: null,
    status: 'pending',
    expiresAt: new Date(Date.now() + ttl).toISOString(),
  }
}

/**
 * Given an existing stored record and the incoming request, decide what to
 * do: replay the stored response, reject as a conflicting reuse, or proceed
 * because it's a genuinely new key.
 */
export type IdempotencyDecision =
  | { action: 'proceed' }
  | { action: 'replay'; responseReference: string | null }
  | { action: 'reject_conflict' }
  | { action: 'wait_for_in_flight' }

export async function decideIdempotency(
  existing: IdempotencyRecord | null,
  incomingPayload: unknown,
): Promise<IdempotencyDecision> {
  if (!existing) return { action: 'proceed' }

  const incomingHash = await hashRequestPayload(incomingPayload)
  if (incomingHash !== existing.requestHash) {
    return { action: 'reject_conflict' }
  }

  if (existing.status === 'completed') {
    return { action: 'replay', responseReference: existing.responseReference }
  }

  if (existing.status === 'pending') {
    return { action: 'wait_for_in_flight' }
  }

  // status === 'failed': same payload retried after a prior failure — safe to redo.
  return { action: 'proceed' }
}
