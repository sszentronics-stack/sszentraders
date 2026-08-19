/**
 * Customer return request flow + admin return review/approve/reject +
 * courier pickup handoff — Phase 14 (Reviews, Returns & Customer Service).
 *
 * Extends the EXISTING `returns`/`return_items`/`return_events` schema from
 * Phase 1 (0009_returns.sql, extended by 0021_reviews_and_returns_workflow.sql)
 * rather than inventing a parallel model. Eligibility is decided entirely
 * server-side by backend/lib/returns' evaluateReturnEligibility() — the
 * frontend never asserts eligibility, quantities, or amounts.
 *
 * Courier pickup for an approved return reuses Phase 11's already-built
 * `bookReturnPickup()` (backend/services/delivery/leopards/shipment.service.ts)
 * rather than re-implementing shipment booking — this file only decides
 * WHEN to call it (right after approval) and never fabricates a tracking
 * number/AWB itself.
 *
 * Financial refund execution (accounting event, Easypaisa/manual refund,
 * LedGix credit note) is deliberately a SEPARATE module —
 * backend/services/reviews/refund.service.ts — so this file stays focused
 * on the return workflow/state machine and courier handoff.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateReturnEligibility,
  generateUniqueReturnNumber,
  isReturnReasonCode,
  type ReturnEligibilityOrderItem,
  type ReturnRequestLine as PolicyReturnRequestLine,
} from '../../lib/returns'
import { assertReturnStatusTransition, type ReturnStatus } from '../../lib/status'
import { validateImageUpload, buildReturnEvidenceStoragePath, type ImageUploadCandidate } from '../../lib/media'
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors'
import { writeAuditLog, type AuditLogWriter } from '../../lib/audit'
import type { CreateReturnRequestInput } from '../../lib/validation'
import type { CourierProvider } from '../../lib/providers/CourierProvider'
import { bookReturnPickup } from '../delivery/leopards/shipment.service'
import { IntegrationNotConfiguredError } from '../../lib/providers/errors'
import { recordReturnTransaction } from '../accounting/accounting.service'

const RETURN_EVIDENCE_BUCKET = 'return-evidence'

const RETURN_COLUMNS = `
  id, order_id, customer_id, return_number, status, reason, customer_notes, internal_notes, refund_amount,
  resolution, inspection_outcome, inspection_notes, refund_method, refund_payment_id,
  ledgix_credit_note_id, ledgix_credit_note_number, created_at, updated_at, closed_at
`
const RETURN_ITEM_COLUMNS = 'id, return_id, order_item_id, quantity, reason, reason_code, refund_amount, created_at'
const RETURN_EVENT_COLUMNS = 'id, return_id, from_status, to_status, note, changed_by, created_at'

interface ReturnRow {
  id: string
  order_id: string
  customer_id: string | null
  return_number: string
  status: ReturnStatus
  reason: string | null
  customer_notes: string | null
  internal_notes: string | null
  refund_amount: number | null
  resolution: 'refund' | 'replacement' | null
  inspection_outcome: string | null
  inspection_notes: string | null
  refund_method: 'easypaisa' | 'manual' | null
  refund_payment_id: string | null
  ledgix_credit_note_id: string | null
  ledgix_credit_note_number: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

interface ReturnItemRow {
  id: string
  return_id: string
  order_item_id: string
  quantity: number
  reason: string | null
  reason_code: string | null
  refund_amount: number | null
  created_at: string
}

interface ReturnEventRow {
  id: string
  return_id: string
  from_status: ReturnStatus | null
  to_status: ReturnStatus
  note: string | null
  changed_by: string | null
  created_at: string
}

export interface ReturnItemRecord {
  id: string
  orderItemId: string
  quantity: number
  reason: string | null
  reasonCode: string | null
  refundAmount: number | null
  evidenceCount: number
}

export interface ReturnEventRecord {
  id: string
  fromStatus: ReturnStatus | null
  toStatus: ReturnStatus
  note: string | null
  createdAt: string
}

export interface ReturnRecord {
  id: string
  orderId: string
  customerId: string | null
  returnNumber: string
  status: ReturnStatus
  reason: string | null
  customerNotes: string | null
  internalNotes: string | null
  refundAmount: number | null
  resolution: 'refund' | 'replacement' | null
  inspectionOutcome: string | null
  inspectionNotes: string | null
  refundMethod: 'easypaisa' | 'manual' | null
  refundPaymentId: string | null
  ledgixCreditNoteId: string | null
  ledgixCreditNoteNumber: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  items: ReturnItemRecord[]
  events: ReturnEventRecord[]
}

function mapReturn(row: ReturnRow, items: ReturnItemRecord[], events: ReturnEventRecord[]): ReturnRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id,
    returnNumber: row.return_number,
    status: row.status,
    reason: row.reason,
    customerNotes: row.customer_notes,
    internalNotes: row.internal_notes,
    refundAmount: row.refund_amount,
    resolution: row.resolution,
    inspectionOutcome: row.inspection_outcome,
    inspectionNotes: row.inspection_notes,
    refundMethod: row.refund_method,
    refundPaymentId: row.refund_payment_id,
    ledgixCreditNoteId: row.ledgix_credit_note_id,
    ledgixCreditNoteNumber: row.ledgix_credit_note_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    items,
    events,
  }
}

async function getCustomerId(db: SupabaseClient, profileId: string): Promise<string | null> {
  const { data } = await db.from('customers').select('id').eq('profile_id', profileId).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function fetchReturnWithDetail(db: SupabaseClient, returnId: string): Promise<ReturnRecord | null> {
  const { data: returnRow, error } = await db.from('returns').select(RETURN_COLUMNS).eq('id', returnId).maybeSingle()
  if (error) throw error
  if (!returnRow) return null

  const { data: itemRows, error: itemsError } = await db
    .from('return_items')
    .select(RETURN_ITEM_COLUMNS)
    .eq('return_id', returnId)
    .order('created_at', { ascending: true })
  if (itemsError) throw itemsError
  const items = (itemRows ?? []) as ReturnItemRow[]

  const { data: evidenceRows, error: evidenceError } = await db
    .from('return_item_evidence')
    .select('id, return_item_id')
    .in(
      'return_item_id',
      items.map((i) => i.id).length > 0 ? items.map((i) => i.id) : ['00000000-0000-0000-0000-000000000000'],
    )
  if (evidenceError) throw evidenceError
  const evidenceCountByItem = new Map<string, number>()
  for (const row of (evidenceRows ?? []) as { id: string; return_item_id: string }[]) {
    evidenceCountByItem.set(row.return_item_id, (evidenceCountByItem.get(row.return_item_id) ?? 0) + 1)
  }

  const { data: eventRows, error: eventsError } = await db
    .from('return_events')
    .select(RETURN_EVENT_COLUMNS)
    .eq('return_id', returnId)
    .order('created_at', { ascending: true })
  if (eventsError) throw eventsError

  const itemRecords: ReturnItemRecord[] = items.map((row) => ({
    id: row.id,
    orderItemId: row.order_item_id,
    quantity: row.quantity,
    reason: row.reason,
    reasonCode: row.reason_code,
    refundAmount: row.refund_amount,
    evidenceCount: evidenceCountByItem.get(row.id) ?? 0,
  }))
  const eventRecords: ReturnEventRecord[] = ((eventRows ?? []) as ReturnEventRow[]).map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    createdAt: row.created_at,
  }))

  return mapReturn(returnRow as ReturnRow, itemRecords, eventRecords)
}

async function insertReturnEvent(
  db: SupabaseClient,
  returnId: string,
  fromStatus: ReturnStatus | null,
  toStatus: ReturnStatus,
  changedBy: string | null,
  note?: string | null,
): Promise<void> {
  const { error } = await db
    .from('return_events')
    .insert({ return_id: returnId, from_status: fromStatus, to_status: toStatus, note: note ?? null, changed_by: changedBy })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Customer-facing: eligibility, evidence upload, request creation, own reads
// ---------------------------------------------------------------------------

interface OrderRowForReturn {
  id: string
  order_number: string
  customer_id: string | null
  order_status: string
}

async function getOrderOwnedByCaller(db: SupabaseClient, customerId: string, orderId: string): Promise<OrderRowForReturn> {
  const { data, error } = await db.from('orders').select('id, order_number, customer_id, order_status').eq('id', orderId).maybeSingle()
  if (error) throw error
  const order = data as OrderRowForReturn | null
  if (!order || order.customer_id !== customerId) throw new NotFoundError('Order') // never distinguish "not yours" from "doesn't exist"
  return order
}

/** The real delivered timestamp for an order — sourced from its outbound shipment, never guessed from order_status alone. */
async function getOrderDeliveredAt(db: SupabaseClient, orderId: string): Promise<string | null> {
  const { data, error } = await db
    .from('shipments')
    .select('delivered_at')
    .eq('order_id', orderId)
    .eq('purpose', 'outbound')
    .not('delivered_at', 'is', null)
    .order('delivered_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data?.delivered_at as string | undefined) ?? null
}

interface OrderItemRowForReturn {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  variant_name: string | null
  quantity: number
  unit_price: number
}

async function getOrderItemsWithReturnedQuantity(
  db: SupabaseClient,
  orderId: string,
): Promise<{ rows: OrderItemRowForReturn[]; eligibility: ReturnEligibilityOrderItem[] }> {
  const { data: items, error } = await db
    .from('order_items')
    .select('id, order_id, product_id, product_name, variant_name, quantity, unit_price')
    .eq('order_id', orderId)
  if (error) throw error
  const rows = (items ?? []) as OrderItemRowForReturn[]
  if (rows.length === 0) return { rows: [], eligibility: [] }

  // "Already requested" = any return_item on a non-rejected return for this
  // order — an in-flight or already-resolved request still consumes the
  // return allowance for those units, preventing a second concurrent/duplicate
  // request for the same units.
  const { data: returnsForOrder, error: returnsError } = await db.from('returns').select('id, status').eq('order_id', orderId)
  if (returnsError) throw returnsError
  const activeReturnIds = ((returnsForOrder ?? []) as { id: string; status: string }[])
    .filter((r) => r.status !== 'rejected')
    .map((r) => r.id)

  const alreadyRequestedByItem = new Map<string, number>()
  if (activeReturnIds.length > 0) {
    const { data: existingItems, error: existingItemsError } = await db
      .from('return_items')
      .select('order_item_id, quantity')
      .in('return_id', activeReturnIds)
    if (existingItemsError) throw existingItemsError
    for (const row of (existingItems ?? []) as { order_item_id: string; quantity: number }[]) {
      alreadyRequestedByItem.set(row.order_item_id, (alreadyRequestedByItem.get(row.order_item_id) ?? 0) + row.quantity)
    }
  }

  const eligibility: ReturnEligibilityOrderItem[] = rows.map((row) => ({
    orderItemId: row.id,
    purchasedQuantity: row.quantity,
    alreadyRequestedQuantity: alreadyRequestedByItem.get(row.id) ?? 0,
  }))

  return { rows, eligibility }
}

export interface ReturnableItem {
  orderItemId: string
  productName: string
  variantName: string | null
  purchasedQuantity: number
  remainingEligibleQuantity: number
  unitPrice: number
}

/** What the customer can pick from when starting a return for one order — remainingEligibleQuantity already accounts for prior requests. Does NOT itself re-check the delivery window/date (that's evaluated at submission time against `now`); this listing just reflects quantities. */
export async function listReturnableItemsForOrder(db: SupabaseClient, profileId: string, orderId: string): Promise<ReturnableItem[]> {
  const customerId = await getCustomerId(db, profileId)
  if (!customerId) throw new NotFoundError('Order')
  await getOrderOwnedByCaller(db, customerId, orderId)

  const { rows, eligibility } = await getOrderItemsWithReturnedQuantity(db, orderId)
  const eligibilityByItem = new Map(eligibility.map((e) => [e.orderItemId, e]))

  return rows.map((row) => {
    const e = eligibilityByItem.get(row.id)
    return {
      orderItemId: row.id,
      productName: row.product_name,
      variantName: row.variant_name,
      purchasedQuantity: row.quantity,
      remainingEligibleQuantity: Math.max(0, (e?.purchasedQuantity ?? row.quantity) - (e?.alreadyRequestedQuantity ?? 0)),
      unitPrice: row.unit_price,
    }
  })
}

/** Signed upload URL for return evidence, scoped to an order item the caller actually owns — issued before the return itself exists (see backend/lib/media's buildReturnEvidenceStoragePath doc). */
export async function createReturnEvidenceUploadUrl(
  db: SupabaseClient,
  profileId: string,
  orderItemId: string,
  candidate: ImageUploadCandidate,
): Promise<{ path: string; signedUrl: string; token: string }> {
  const customerId = await getCustomerId(db, profileId)
  if (!customerId) throw new NotFoundError('Order item')

  const { data: itemRow, error } = await db.from('order_items').select('id, order_id').eq('id', orderItemId).maybeSingle()
  if (error) throw error
  const item = itemRow as { id: string; order_id: string } | null
  if (!item) throw new NotFoundError('Order item')
  await getOrderOwnedByCaller(db, customerId, item.order_id) // throws NotFoundError if not owned

  const mimeType = validateImageUpload(candidate)
  const evidenceId = crypto.randomUUID()
  const path = buildReturnEvidenceStoragePath({ orderItemId, evidenceId, mimeType })

  const { data, error: signError } = await db.storage.from(RETURN_EVIDENCE_BUCKET).createSignedUploadUrl(path)
  if (signError || !data) throw signError ?? new Error('Failed to create signed upload URL.')
  return { path: data.path, signedUrl: data.signedUrl, token: data.token }
}

/**
 * Create a return request. Re-derives EVERYTHING needed for the eligibility
 * decision from the database (order status, real delivered date, purchased/
 * already-requested quantities) and runs it through
 * backend/lib/returns' evaluateReturnEligibility() — never trusts anything
 * the client asserted about eligibility. Per-item refund_amount is computed
 * here as the maximum refundable estimate (unit_price * quantity); the
 * FINAL refund amount is only ever decided later, capped against this, by
 * recordInspectionOutcome() below.
 */
export async function createReturnRequest(db: SupabaseClient, profileId: string, input: CreateReturnRequestInput): Promise<ReturnRecord> {
  const customerId = await getCustomerId(db, profileId)
  if (!customerId) throw new NotFoundError('Order')
  const order = await getOrderOwnedByCaller(db, customerId, input.orderId)
  const deliveredAt = await getOrderDeliveredAt(db, input.orderId)
  const { rows: orderItems, eligibility } = await getOrderItemsWithReturnedQuantity(db, input.orderId)
  const orderItemsById = new Map(orderItems.map((r) => [r.id, r]))

  const policyLines: PolicyReturnRequestLine[] = input.items.map((line) => ({
    orderItemId: line.orderItemId,
    quantity: line.quantity,
    reasonCode: isReturnReasonCode(line.reasonCode) ? line.reasonCode : 'other',
    hasEvidence: line.evidenceStoragePaths.length > 0,
  }))

  const result = evaluateReturnEligibility({
    orderStatus: order.order_status,
    deliveredAt,
    now: new Date(),
    orderItems: eligibility,
    requestedLines: policyLines,
  })

  if (!result.eligible) {
    const issues = [
      ...result.orderLevelReasons.map((message) => ({ path: 'orderId', message })),
      ...result.lines.flatMap((line) => line.reasons.map((message) => ({ path: line.orderItemId, message }))),
    ]
    throw new ValidationError('This return request is not eligible.', issues)
  }

  const returnNumber = await generateUniqueReturnNumber(
    new Date(),
    () => crypto.randomUUID().replace(/-/g, '').slice(0, 6),
    async (candidate) => {
      const { data } = await db.from('returns').select('id').eq('return_number', candidate).maybeSingle()
      return Boolean(data)
    },
  )

  let totalRefundEstimate = 0
  const itemInserts = input.items.map((line) => {
    const orderItem = orderItemsById.get(line.orderItemId)
    const refundEstimate = orderItem ? orderItem.unit_price * line.quantity : 0
    totalRefundEstimate += refundEstimate
    return { line, refundEstimate }
  })

  const { data: returnRow, error: returnError } = await db
    .from('returns')
    .insert({
      order_id: input.orderId,
      customer_id: customerId,
      return_number: returnNumber,
      status: 'requested',
      customer_notes: input.customerNotes ?? null,
      refund_amount: totalRefundEstimate,
    })
    .select(RETURN_COLUMNS)
    .single()
  if (returnError) throw returnError
  const returnRecord = returnRow as ReturnRow

  for (const { line, refundEstimate } of itemInserts) {
    const { data: itemRow, error: itemError } = await db
      .from('return_items')
      .insert({
        return_id: returnRecord.id,
        order_item_id: line.orderItemId,
        quantity: line.quantity,
        reason: line.notes ?? null,
        reason_code: line.reasonCode,
        refund_amount: refundEstimate,
      })
      .select('id')
      .single()
    if (itemError) throw itemError

    if (line.evidenceStoragePaths.length > 0) {
      const { error: evidenceError } = await db
        .from('return_item_evidence')
        .insert(line.evidenceStoragePaths.map((storagePath) => ({ return_item_id: itemRow.id as string, storage_path: storagePath })))
      if (evidenceError) throw evidenceError
    }
  }

  await insertReturnEvent(db, returnRecord.id, null, 'requested', null, 'Return requested by customer.')

  const created = await fetchReturnWithDetail(db, returnRecord.id)
  if (!created) throw new NotFoundError('Return')
  return created
}

export async function listMyReturns(db: SupabaseClient, profileId: string): Promise<ReturnRecord[]> {
  const customerId = await getCustomerId(db, profileId)
  if (!customerId) return []

  const { data, error } = await db.from('returns').select('id').eq('customer_id', customerId).order('created_at', { ascending: false })
  if (error) throw error
  const results: ReturnRecord[] = []
  for (const row of (data ?? []) as { id: string }[]) {
    const detail = await fetchReturnWithDetail(db, row.id)
    if (detail) results.push(detail)
  }
  return results
}

/** Verify `returnId` belongs to the caller (or the caller is an admin) before returning it — same ownership-check shape as orders.service.ts's getOrderForCaller(). */
export async function getReturnForCaller(db: SupabaseClient, profileId: string, isAdmin: boolean, returnId: string): Promise<ReturnRecord> {
  const detail = await fetchReturnWithDetail(db, returnId)
  if (!detail) throw new NotFoundError('Return')
  if (isAdmin) return detail

  const customerId = await getCustomerId(db, profileId)
  if (!customerId || detail.customerId !== customerId) throw new NotFoundError('Return')
  return detail
}

// ---------------------------------------------------------------------------
// Admin-facing: review/approve/reject, courier handoff, inspection outcome
// ---------------------------------------------------------------------------

export interface AdminActor {
  profileId: string
  authUserId: string
}

export interface ReturnListFilters {
  status?: ReturnStatus
  limit?: number
}

export async function listReturnsForAdmin(db: SupabaseClient, filters: ReturnListFilters = {}): Promise<ReturnRecord[]> {
  let query = db.from('returns').select('id').order('created_at', { ascending: false }).limit(filters.limit ?? 100)
  if (filters.status) query = query.eq('status', filters.status)
  const { data, error } = await query
  if (error) throw error
  const results: ReturnRecord[] = []
  for (const row of (data ?? []) as { id: string }[]) {
    const detail = await fetchReturnWithDetail(db, row.id)
    if (detail) results.push(detail)
  }
  return results
}

async function transitionReturn(
  db: SupabaseClient & AuditLogWriter,
  returnId: string,
  toStatus: ReturnStatus,
  actor: AdminActor,
  auditAction: string,
  note?: string | null,
  extraColumns: Record<string, unknown> = {},
): Promise<ReturnRecord> {
  const { data: existing, error: existingError } = await db.from('returns').select('id, status').eq('id', returnId).maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new NotFoundError('Return')
  const fromStatus = existing.status as ReturnStatus
  assertReturnStatusTransition(fromStatus, toStatus)

  const closedAt = toStatus === 'closed' ? new Date().toISOString() : undefined
  const { error } = await db
    .from('returns')
    .update({ status: toStatus, internal_notes: note ?? undefined, ...(closedAt ? { closed_at: closedAt } : {}), ...extraColumns })
    .eq('id', returnId)
  if (error) throw error

  await insertReturnEvent(db, returnId, fromStatus, toStatus, actor.profileId, note ?? null)
  await writeAuditLog(db, {
    actor: actor.profileId,
    actorType: 'admin',
    action: auditAction,
    entityType: 'return',
    entityId: returnId,
    metadata: { fromStatus, toStatus },
  })

  const updated = await fetchReturnWithDetail(db, returnId)
  if (!updated) throw new NotFoundError('Return')
  return updated
}

export function moveReturnUnderReview(
  db: SupabaseClient & AuditLogWriter,
  returnId: string,
  actor: AdminActor,
  note?: string,
): Promise<ReturnRecord> {
  return transitionReturn(db, returnId, 'under_review', actor, 'return.moved_under_review', note)
}

export function rejectReturn(db: SupabaseClient & AuditLogWriter, returnId: string, actor: AdminActor, note?: string): Promise<ReturnRecord> {
  return transitionReturn(db, returnId, 'rejected', actor, 'return.rejected', note)
}

export interface ApproveReturnResult {
  returnRecord: ReturnRecord
  pickupBooked: boolean
  pickupError: string | null
}

/**
 * Approve a return and immediately attempt to book the Leopards pickup via
 * Phase 11's already-built bookReturnPickup(). A courier booking failure
 * (today: always IntegrationNotConfiguredError — no real Leopards
 * credentials exist anywhere in this project) does NOT roll back the
 * approval itself: the return moving to `approved` is the operationally
 * important fact ("we agreed to take this back"), and the pickup can always
 * be retried later via the existing `shipments` Edge Function's
 * `bookReturnPickup` action once real courier credentials exist. This
 * mirrors the rest of the codebase's "never let an expected not-configured
 * integration failure block the core operational action" pattern (e.g.
 * accounting's best-effort erp_sync_jobs insert).
 */
export async function approveReturn(
  db: SupabaseClient & AuditLogWriter,
  courierProvider: CourierProvider,
  returnId: string,
  actor: AdminActor,
  note?: string,
): Promise<ApproveReturnResult> {
  const returnRecord = await transitionReturn(db, returnId, 'approved', actor, 'return.approved', note)

  try {
    await bookReturnPickup(db, courierProvider, returnId)
    await writeAuditLog(db, {
      actor: actor.profileId,
      actorType: 'admin',
      action: 'return.pickup_booking_attempted',
      entityType: 'return',
      entityId: returnId,
      metadata: { outcome: 'booked' },
    })
    return { returnRecord: (await fetchReturnWithDetail(db, returnId)) ?? returnRecord, pickupBooked: true, pickupError: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await writeAuditLog(db, {
      actor: actor.profileId,
      actorType: 'admin',
      action: 'return.pickup_booking_attempted',
      entityType: 'return',
      entityId: returnId,
      metadata: { outcome: err instanceof IntegrationNotConfiguredError ? 'not_configured' : 'failed' },
    })
    return { returnRecord, pickupBooked: false, pickupError: message }
  }
}

/** Manual/drop-off receipt, or the terminal step of a courier-tracked pickup — either way, the item is now physically back and ready for inspection. */
export function markReturnReceived(
  db: SupabaseClient & AuditLogWriter,
  returnId: string,
  actor: AdminActor,
  note?: string,
): Promise<ReturnRecord> {
  return transitionReturn(db, returnId, 'received', actor, 'return.received', note)
}

export interface InspectionOutcomeInput {
  resolution: 'refund' | 'replacement'
  inspectionNotes?: string
  refundAmount?: number
}

/**
 * Record what an admin found on inspecting the received item, and move the
 * return to its resolved state. This function ONLY updates the return's own
 * row/status/timeline — it deliberately does NOT itself touch payments,
 * accounting, or LedGix. The actual financial refund execution is
 * backend/services/reviews/refund.service.ts's processReturnRefund(),
 * called by the caller (the returns Edge Function) right after this
 * succeeds, keeping "decide the outcome" and "move money" as separate,
 * independently-testable steps.
 */
export async function recordInspectionOutcome(
  db: SupabaseClient & AuditLogWriter,
  returnId: string,
  input: InspectionOutcomeInput,
  actor: AdminActor,
): Promise<ReturnRecord> {
  const existing = await fetchReturnWithDetail(db, returnId)
  if (!existing) throw new NotFoundError('Return')
  if (existing.status !== 'received') {
    throw new ConflictError(`Return "${returnId}" must be "received" before an inspection outcome can be recorded (current status: "${existing.status}").`)
  }

  let refundAmount: number | null = null
  if (input.resolution === 'refund') {
    const maxRefundable = existing.refundAmount ?? 0
    const requested = input.refundAmount ?? 0
    if (requested <= 0 || requested > maxRefundable) {
      throw new ValidationError(`Refund amount must be positive and not exceed the requested return's estimate (max ${maxRefundable}).`)
    }
    refundAmount = requested
  }

  const toStatus: ReturnStatus = input.resolution === 'refund' ? 'refunded' : 'replaced'
  const updated = await transitionReturn(db, returnId, toStatus, actor, 'return.inspection_outcome_recorded', input.inspectionNotes, {
    resolution: input.resolution,
    inspection_notes: input.inspectionNotes ?? null,
    ...(refundAmount !== null ? { refund_amount: refundAmount } : {}),
  })

  // Record the "goods physically returned" local financial event now, for
  // BOTH resolutions — a replacement still means stock came back, it just
  // has no refund amount (0). The refund-specific financial steps (the
  // refund event itself, Easypaisa, LedGix credit note) are a deliberately
  // separate call — see backend/services/reviews/refund.service.ts's
  // processReturnRefund(), invoked by the caller right after this succeeds
  // when resolution === 'refund'.
  const { data: orderRow } = await db.from('orders').select('currency').eq('id', updated.orderId).maybeSingle()
  const currency = (orderRow?.currency as string | undefined) ?? 'PKR'
  await recordReturnTransaction(
    db,
    { id: returnId, orderId: updated.orderId, currency, refundAmount: refundAmount ?? 0 },
    'reviews.returns.recordInspectionOutcome',
  )

  return updated
}

/** Admin-only: mark a resolved return fully closed (customer notified, nothing further to do). */
export function closeReturn(db: SupabaseClient & AuditLogWriter, returnId: string, actor: AdminActor, note?: string): Promise<ReturnRecord> {
  return transitionReturn(db, returnId, 'closed', actor, 'return.closed', note)
}
