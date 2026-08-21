import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { LeopardsCourierProvider } from '../../lib/providers/leopards/LeopardsCourierProvider.ts'
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors/index.ts'
import { InvalidReturnStatusTransitionError } from '../../lib/status/index.ts'
import type { AuditLogWriter } from '../../lib/audit/index.ts'
import { FakeSupabaseClient } from './testUtils.ts'
import {
  approveReturn,
  createReturnRequest,
  getReturnForCaller,
  listMyReturns,
  listReturnableItemsForOrder,
  listReturnsForAdmin,
  markReturnReceived,
  moveReturnUnderReview,
  recordInspectionOutcome,
  rejectReturn,
} from './returns.service.ts'

const PROFILE_ID = 'profile-1'
const CUSTOMER_ID = 'customer-1'
const ORDER_ID = 'order-1'
const ORDER_ITEM_ID = 'order-item-1'
const DELIVERED_AT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

function client(db: FakeSupabaseClient) {
  return db as unknown as SupabaseClient
}
function auditedClient(db: FakeSupabaseClient) {
  return db as unknown as SupabaseClient & AuditLogWriter
}

function seedDeliveredOrder(db: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  db.seed('customers', [{ id: CUSTOMER_ID, profile_id: PROFILE_ID }])
  db.seed('orders', [{ id: ORDER_ID, customer_id: CUSTOMER_ID, order_status: 'delivered', order_number: 'AURA-20260819-ABC123', currency: 'PKR', ...overrides }])
  db.seed('order_items', [{ id: ORDER_ITEM_ID, order_id: ORDER_ID, product_id: 'product-1', product_name: 'Collagen Mask', variant_name: null, quantity: 2, unit_price: 5000 }])
  db.seed('shipments', [{ id: 'ship-1', order_id: ORDER_ID, purpose: 'outbound', status: 'delivered', delivered_at: DELIVERED_AT }])
}

const actor = { profileId: 'admin-1', authUserId: 'auth-1' }

function notConfiguredCourier() {
  return new LeopardsCourierProvider(null)
}

describe('listReturnableItemsForOrder', () => {
  it('reports remaining eligible quantity', async () => {
    const db = new FakeSupabaseClient()
    seedDeliveredOrder(db)
    const items = await listReturnableItemsForOrder(client(db), PROFILE_ID, ORDER_ID)
    expect(items).toEqual([
      { orderItemId: ORDER_ITEM_ID, productName: 'Collagen Mask', variantName: null, purchasedQuantity: 2, remainingEligibleQuantity: 2, unitPrice: 5000 },
    ])
  })

  it('throws NotFoundError for an order not owned by the caller', async () => {
    const db = new FakeSupabaseClient()
    seedDeliveredOrder(db)
    await expect(listReturnableItemsForOrder(client(db), 'someone-else', ORDER_ID)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('createReturnRequest', () => {
  it('creates a requested return with a computed refund estimate and a timeline event', async () => {
    const db = new FakeSupabaseClient()
    seedDeliveredOrder(db)
    const created = await createReturnRequest(client(db), PROFILE_ID, {
      orderId: ORDER_ID,
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'changed_mind', evidenceStoragePaths: [] }],
    })
    expect(created.status).toBe('requested')
    expect(created.refundAmount).toBe(5000)
    expect(created.items).toHaveLength(1)
    expect(created.items[0]!.quantity).toBe(1)
    expect(created.events).toHaveLength(1)
    expect(created.events[0]!.toStatus).toBe('requested')
  })

  it('stores evidence rows for a line that includes them', async () => {
    const db = new FakeSupabaseClient()
    seedDeliveredOrder(db)
    const created = await createReturnRequest(client(db), PROFILE_ID, {
      orderId: ORDER_ID,
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'damaged_in_transit', evidenceStoragePaths: ['order-item-1/ev-1.jpg'] }],
    })
    expect(created.items[0]!.evidenceCount).toBe(1)
  })

  it('rejects a reason requiring evidence with none attached', async () => {
    const db = new FakeSupabaseClient()
    seedDeliveredOrder(db)
    await expect(
      createReturnRequest(client(db), PROFILE_ID, {
        orderId: ORDER_ID,
        items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'damaged_in_transit', evidenceStoragePaths: [] }],
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects a request for an order outside the return window', async () => {
    const db = new FakeSupabaseClient()
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    seedDeliveredOrder(db)
    db.seed('shipments', [{ id: 'ship-1', order_id: ORDER_ID, purpose: 'outbound', status: 'delivered', delivered_at: longAgo }])
    await expect(
      createReturnRequest(client(db), PROFILE_ID, {
        orderId: ORDER_ID,
        items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'changed_mind', evidenceStoragePaths: [] }],
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects requesting more than the purchased quantity', async () => {
    const db = new FakeSupabaseClient()
    seedDeliveredOrder(db)
    await expect(
      createReturnRequest(client(db), PROFILE_ID, {
        orderId: ORDER_ID,
        items: [{ orderItemId: ORDER_ITEM_ID, quantity: 5, reasonCode: 'changed_mind', evidenceStoragePaths: [] }],
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('accounts for a prior non-rejected return when computing remaining quantity', async () => {
    const db = new FakeSupabaseClient()
    seedDeliveredOrder(db)
    await createReturnRequest(client(db), PROFILE_ID, {
      orderId: ORDER_ID,
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 2, reasonCode: 'changed_mind', evidenceStoragePaths: [] }],
    })
    await expect(
      createReturnRequest(client(db), PROFILE_ID, {
        orderId: ORDER_ID,
        items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'changed_mind', evidenceStoragePaths: [] }],
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('listMyReturns / getReturnForCaller', () => {
  it('lists and fetches only the caller\'s own returns', async () => {
    const db = new FakeSupabaseClient()
    seedDeliveredOrder(db)
    const created = await createReturnRequest(client(db), PROFILE_ID, {
      orderId: ORDER_ID,
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'changed_mind', evidenceStoragePaths: [] }],
    })
    const mine = await listMyReturns(client(db), PROFILE_ID)
    expect(mine.map((r) => r.id)).toEqual([created.id])

    const fetched = await getReturnForCaller(client(db), PROFILE_ID, false, created.id)
    expect(fetched.id).toBe(created.id)

    await expect(getReturnForCaller(client(db), 'someone-else', false, created.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getReturnForCaller(client(db), 'someone-else', true, created.id)).resolves.toMatchObject({ id: created.id })
  })
})

describe('admin transitions', () => {
  async function createRequestedReturn(db: FakeSupabaseClient) {
    seedDeliveredOrder(db)
    return createReturnRequest(client(db), PROFILE_ID, {
      orderId: ORDER_ID,
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'changed_mind', evidenceStoragePaths: [] }],
    })
  }

  it('moves a requested return under review, then approves it', async () => {
    const db = new FakeSupabaseClient()
    const created = await createRequestedReturn(db)
    const reviewed = await moveReturnUnderReview(auditedClient(db), created.id, actor, 'Looking into it')
    expect(reviewed.status).toBe('under_review')

    const approval = await approveReturn(auditedClient(db), notConfiguredCourier(), created.id, actor)
    expect(approval.returnRecord.status).toBe('approved')
    // No real Leopards credentials exist anywhere in this project — the
    // pickup attempt must fail closed (not_configured), never fabricate a
    // tracking number, and must NOT roll back the approval itself.
    expect(approval.pickupBooked).toBe(false)
    expect(approval.pickupError).toBeTruthy()
  })

  it('rejects a requested return with an audited event', async () => {
    const db = new FakeSupabaseClient()
    const created = await createRequestedReturn(db)
    const rejected = await rejectReturn(auditedClient(db), created.id, actor, 'Outside policy')
    expect(rejected.status).toBe('rejected')
    expect(rejected.events.at(-1)?.toStatus).toBe('rejected')
    expect(db.getTable('audit_logs').some((row) => row.action === 'return.rejected')).toBe(true)
  })

  it('refuses an invalid transition (e.g. requested -> received)', async () => {
    const db = new FakeSupabaseClient()
    const created = await createRequestedReturn(db)
    // markReturnReceived requires 'approved'/'pickup_requested'/'in_transit' as the from-state; 'requested' is not one of them.
    await expect(markReturnReceived(auditedClient(db), created.id, actor)).rejects.toBeInstanceOf(InvalidReturnStatusTransitionError)
  })

  it('lists returns for admin, optionally filtered by status', async () => {
    const db = new FakeSupabaseClient()
    const created = await createRequestedReturn(db)
    await rejectReturn(auditedClient(db), created.id, actor)
    const rejectedOnly = await listReturnsForAdmin(client(db), { status: 'rejected' })
    expect(rejectedOnly.map((r) => r.id)).toEqual([created.id])
    expect(await listReturnsForAdmin(client(db), { status: 'approved' })).toEqual([])
  })
})

describe('recordInspectionOutcome', () => {
  async function receivedReturn(db: FakeSupabaseClient) {
    seedDeliveredOrder(db)
    const created = await createReturnRequest(client(db), PROFILE_ID, {
      orderId: ORDER_ID,
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'changed_mind', evidenceStoragePaths: [] }],
    })
    await moveReturnUnderReview(auditedClient(db), created.id, actor)
    await approveReturn(auditedClient(db), notConfiguredCourier(), created.id, actor)
    return markReturnReceived(auditedClient(db), created.id, actor)
  }

  it('records a refund outcome and moves the return to refunded', async () => {
    const db = new FakeSupabaseClient()
    const received = await receivedReturn(db)
    const outcome = await recordInspectionOutcome(auditedClient(db), received.id, { resolution: 'refund', refundAmount: 5000 }, actor)
    expect(outcome.status).toBe('refunded')
    expect(outcome.resolution).toBe('refund')
    expect(outcome.refundAmount).toBe(5000)
  })

  it('records a replacement outcome with no refund amount', async () => {
    const db = new FakeSupabaseClient()
    const received = await receivedReturn(db)
    const outcome = await recordInspectionOutcome(auditedClient(db), received.id, { resolution: 'replacement' }, actor)
    expect(outcome.status).toBe('replaced')
    expect(outcome.resolution).toBe('replacement')
  })

  it('caps the refund amount to the requested return estimate', async () => {
    const db = new FakeSupabaseClient()
    const received = await receivedReturn(db)
    await expect(
      recordInspectionOutcome(auditedClient(db), received.id, { resolution: 'refund', refundAmount: 999999 }, actor),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses an inspection outcome before the return is received', async () => {
    const db = new FakeSupabaseClient()
    seedDeliveredOrder(db)
    const created = await createReturnRequest(client(db), PROFILE_ID, {
      orderId: ORDER_ID,
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reasonCode: 'changed_mind', evidenceStoragePaths: [] }],
    })
    await expect(
      recordInspectionOutcome(auditedClient(db), created.id, { resolution: 'refund', refundAmount: 1000 }, actor),
    ).rejects.toBeInstanceOf(ConflictError)
  })
})
