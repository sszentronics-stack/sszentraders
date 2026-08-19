import { describe, expect, it } from 'vitest'
import { buildPendingIdempotencyRecord, decideIdempotency, hashRequestPayload } from './index'

describe('idempotency helper', () => {
  it('hashes equal payloads to the same value regardless of key order', async () => {
    const a = await hashRequestPayload({ orderId: '1', amount: 100 })
    const b = await hashRequestPayload({ amount: 100, orderId: '1' })
    expect(a).toBe(b)
  })

  it('hashes different payloads to different values', async () => {
    const a = await hashRequestPayload({ amount: 100 })
    const b = await hashRequestPayload({ amount: 200 })
    expect(a).not.toBe(b)
  })

  it('builds a pending record with a future expiry', async () => {
    const record = await buildPendingIdempotencyRecord({
      key: 'order-create-abc',
      scope: 'order.create',
      payload: { customerId: '1' },
    })
    expect(record.status).toBe('pending')
    expect(new Date(record.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('proceeds when there is no existing record', async () => {
    const decision = await decideIdempotency(null, { a: 1 })
    expect(decision.action).toBe('proceed')
  })

  it('replays the stored response for a completed key with the same payload', async () => {
    const record = await buildPendingIdempotencyRecord({ key: 'k', scope: 's', payload: { a: 1 } })
    const decision = await decideIdempotency(
      { ...record, status: 'completed', responseReference: 'order-123' },
      { a: 1 },
    )
    expect(decision).toEqual({ action: 'replay', responseReference: 'order-123' })
  })

  it('rejects a key reused with a different payload', async () => {
    const record = await buildPendingIdempotencyRecord({ key: 'k', scope: 's', payload: { a: 1 } })
    const decision = await decideIdempotency(record, { a: 2 })
    expect(decision.action).toBe('reject_conflict')
  })

  it('signals wait_for_in_flight for a still-pending key with the same payload', async () => {
    const record = await buildPendingIdempotencyRecord({ key: 'k', scope: 's', payload: { a: 1 } })
    const decision = await decideIdempotency(record, { a: 1 })
    expect(decision.action).toBe('wait_for_in_flight')
  })

  it('allows retrying a previously failed key with the same payload', async () => {
    const record = await buildPendingIdempotencyRecord({ key: 'k', scope: 's', payload: { a: 1 } })
    const decision = await decideIdempotency({ ...record, status: 'failed' }, { a: 1 })
    expect(decision.action).toBe('proceed')
  })
})
