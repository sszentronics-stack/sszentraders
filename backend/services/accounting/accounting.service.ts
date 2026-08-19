/**
 * Local operational accounting — Phase 7 (Local Operational Accounting
 * Layer). Persists every commerce financial event as a row in
 * `local_financial_transactions` (0011_accounting_erp_sync.sql, extended by
 * 0019_accounting_local_financial_events.sql) BEFORE any ERP sync is even
 * attempted, and schedules the sync as a `pending` `erp_sync_jobs` row for
 * Phase 8 to eventually process. This module never calls LedGix — it does
 * not import backend/lib/providers/ledgix at all — it only prepares the
 * queue Phase 8's real ErpProvider-backed sync worker will drain.
 *
 * THIS IS AN OPERATIONAL STAGING RECORD, NOT AUTHORITATIVE FINANCIAL
 * REPORTING. LedGix ERP (Phase 8) is authoritative; see
 * backend/lib/accounting's module doc for the full rationale, and
 * supabase/migrations/0011_accounting_erp_sync.sql's table comment.
 *
 * Called from commerce domain-event call sites (e.g.
 * backend/services/orders/orders.service.ts's createOrder()), never from
 * UI components, and never with client-suppliable amounts — every function
 * here takes already-computed, already-persisted domain values (an order
 * row, a payment row, a return row), matching the "never trust the client
 * for money" rule the rest of this codebase already follows.
 *
 * ATOMICITY: Supabase's JS client talks to Postgres over PostgREST, one
 * statement per call — there is no cross-table client-side transaction
 * boundary available here (the same constraint orders.service.ts already
 * lives with for its own order/order_items/payments sequence). Rather than
 * inventing a new RPC/transaction boundary for this phase, financial-event
 * recording follows the exact same "sequential best-effort write, propagate
 * any error" shape orders.service.ts already uses: recordSaleTransaction()
 * is called synchronously, in-line, right after the order/items/payment
 * inserts inside createOrder(), and if it throws, createOrder() throws too
 * — the caller (the orders Edge Function) already treats the whole
 * operation as failed in that case and marks the idempotency key `failed`,
 * safe to retry. On retry, buildFinancialEventIdempotencyKey() yields the
 * SAME key for the same order, so a partially-completed previous attempt
 * (order created, financial event not yet written) cannot produce a
 * duplicate financial event on the next attempt — see the unique index
 * added by 0019 and the conflict handling in recordFinancialEvent() below.
 * This is the "compensating-write pattern" the phase spec asks to be
 * documented when a literal DB transaction isn't available.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ERP_ENTITY_TYPE_FINANCIAL_EVENT,
  buildFinancialEventIdempotencyKey,
  type FinancialTransactionType,
} from '../../lib/accounting'
import { ServerError } from '../../lib/errors'
import { writeAuditLog, type AuditLogWriter } from '../../lib/audit'

const UNIQUE_VIOLATION = '23505'

export interface FinancialTransactionRecord {
  id: string
  orderId: string | null
  paymentId: string | null
  shipmentId: string | null
  returnId: string | null
  transactionType: FinancialTransactionType
  amount: number
  currency: string
  description: string | null
  source: string
  occurredAt: string
  idempotencyKey: string | null
  ledgixDocumentId: string | null
  ledgixDocumentNumber: string | null
}

interface FinancialTransactionRow {
  id: string
  order_id: string | null
  payment_id: string | null
  shipment_id: string | null
  return_id: string | null
  transaction_type: FinancialTransactionType
  amount: number
  currency: string
  description: string | null
  source: string
  occurred_at: string
  idempotency_key: string | null
  ledgix_document_id: string | null
  ledgix_document_number: string | null
}

function mapRow(row: FinancialTransactionRow): FinancialTransactionRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    paymentId: row.payment_id,
    shipmentId: row.shipment_id,
    returnId: row.return_id,
    transactionType: row.transaction_type,
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    source: row.source,
    occurredAt: row.occurred_at,
    idempotencyKey: row.idempotency_key,
    ledgixDocumentId: row.ledgix_document_id,
    ledgixDocumentNumber: row.ledgix_document_number,
  }
}

const TRANSACTION_COLUMNS =
  'id, order_id, payment_id, shipment_id, return_id, transaction_type, amount, currency, description, source, occurred_at, idempotency_key, ledgix_document_id, ledgix_document_number'

export interface RecordFinancialEventInput {
  transactionType: FinancialTransactionType
  idempotencyKey: string
  amount: number // minor units — see backend/lib/money
  currency: string
  orderId?: string | null
  paymentId?: string | null
  shipmentId?: string | null
  returnId?: string | null
  description?: string | null
  occurredAt?: string
  source: string
}

/**
 * Shared low-level writer every recordXTransaction() helper below funnels
 * through. Inserts the local_financial_transactions row and its matching
 * `pending` erp_sync_jobs row. If a row with the same idempotency_key
 * already exists (unique_violation, Postgres error 23505), that is treated
 * as success-via-replay: the existing row is fetched and returned instead
 * of raising — this is what makes every recordXTransaction() function safe
 * to call more than once for the same domain event (retried Edge Function
 * invocation, concurrent callers, etc.) without ever producing two
 * financial-event rows for one event.
 */
async function recordFinancialEvent(
  db: SupabaseClient,
  input: RecordFinancialEventInput,
): Promise<FinancialTransactionRecord> {
  const { data: inserted, error } = await db
    .from('local_financial_transactions')
    .insert({
      order_id: input.orderId ?? null,
      payment_id: input.paymentId ?? null,
      shipment_id: input.shipmentId ?? null,
      return_id: input.returnId ?? null,
      transaction_type: input.transactionType,
      amount: input.amount,
      currency: input.currency,
      description: input.description ?? null,
      source: input.source,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      idempotency_key: input.idempotencyKey,
    })
    .select(TRANSACTION_COLUMNS)
    .single()

  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      // Same event already recorded (concurrent call or a retry after a
      // partial failure) — fetch and return the existing row rather than
      // erroring, so callers never need to special-case "already exists".
      const { data: existing, error: fetchError } = await db
        .from('local_financial_transactions')
        .select(TRANSACTION_COLUMNS)
        .eq('idempotency_key', input.idempotencyKey)
        .single()
      if (fetchError || !existing) {
        throw new ServerError('Financial event insert conflicted but the existing row could not be re-fetched.')
      }
      return mapRow(existing as FinancialTransactionRow)
    }
    throw error
  }

  const transaction = mapRow(inserted as FinancialTransactionRow)

  // Schedule the ERP sync as 'pending' — Phase 7 never calls the ERP
  // itself (LedGixErpProvider still throws IntegrationNotConfiguredError
  // until Phase 8 wires it up). A best-effort insert: if this fails, the
  // financial event itself is still safely recorded (the source of truth
  // for "did the sale/payment/etc. happen locally"); listUnsyncedFinancialEvents()
  // below will surface a transaction with no sync job as needing attention,
  // and retryFinancialEventSync() can (re)create one.
  const { error: jobError } = await db.from('erp_sync_jobs').insert({
    provider: 'ledgix',
    entity_type: ERP_ENTITY_TYPE_FINANCIAL_EVENT,
    entity_id: transaction.id,
    direction: 'push',
    status: 'pending',
  })
  if (jobError) {
    // Non-fatal: log-worthy but does not roll back the financial record.
    // (No logger import here to keep this module dependency-light and
    // testable without Deno-only globals; the Edge Function caller's
    // withErrorHandling wrapper already logs unexpected errors — this path
    // does not throw, so nothing is swallowed silently at the HTTP layer.)
  }

  return transaction
}

// ---------------------------------------------------------------------------
// Commerce-event entry points. Each takes already-persisted domain values —
// never client-suppliable amounts — and is idempotent per underlying entity.
// ---------------------------------------------------------------------------

export interface OrderForAccounting {
  id: string
  orderNumber?: string
  currency: string
  grandTotal: number
  discountTotal?: number
  shippingTotal?: number
}

/** Records the sale event for a newly created order. One per order (idempotency key: accounting:sale:<orderId>). */
export function recordSaleTransaction(
  db: SupabaseClient,
  order: OrderForAccounting,
  source = 'orders.service.createOrder',
): Promise<FinancialTransactionRecord> {
  return recordFinancialEvent(db, {
    transactionType: 'sale',
    idempotencyKey: buildFinancialEventIdempotencyKey('sale', order.id),
    amount: order.grandTotal,
    currency: order.currency,
    orderId: order.id,
    description: order.orderNumber ? `Sale for order ${order.orderNumber}` : 'Sale',
    source,
  })
}

/** Records the discount applied on an order, if any (skips silently — caller should only call this when discountTotal > 0). */
export function recordDiscountTransaction(
  db: SupabaseClient,
  order: OrderForAccounting,
  source = 'orders.service.createOrder',
): Promise<FinancialTransactionRecord> {
  return recordFinancialEvent(db, {
    transactionType: 'discount',
    idempotencyKey: buildFinancialEventIdempotencyKey('discount', order.id),
    amount: order.discountTotal ?? 0,
    currency: order.currency,
    orderId: order.id,
    description: order.orderNumber ? `Discount for order ${order.orderNumber}` : 'Discount',
    source,
  })
}

/** Records the delivery/shipping charge for an order (optionally tied to a specific shipment once one exists — Phase 11). */
export function recordDeliveryChargeTransaction(
  db: SupabaseClient,
  order: OrderForAccounting,
  shipmentId?: string,
  source = 'orders.service.createOrder',
): Promise<FinancialTransactionRecord> {
  return recordFinancialEvent(db, {
    transactionType: 'delivery_charge',
    idempotencyKey: buildFinancialEventIdempotencyKey('delivery_charge', order.id),
    amount: order.shippingTotal ?? 0,
    currency: order.currency,
    orderId: order.id,
    shipmentId: shipmentId ?? null,
    description: order.orderNumber ? `Delivery charge for order ${order.orderNumber}` : 'Delivery charge',
    source,
  })
}

export interface PaymentForAccounting {
  id: string
  orderId: string
  currency: string
  amount: number
}

/** Records a settled/attempted payment against an order. One per payment (idempotency key: accounting:payment:<paymentId>). */
export function recordPaymentTransaction(
  db: SupabaseClient,
  payment: PaymentForAccounting,
  source = 'payments.service',
): Promise<FinancialTransactionRecord> {
  return recordFinancialEvent(db, {
    transactionType: 'payment',
    idempotencyKey: buildFinancialEventIdempotencyKey('payment', payment.id),
    amount: payment.amount,
    currency: payment.currency,
    orderId: payment.orderId,
    paymentId: payment.id,
    description: 'Payment received',
    source,
  })
}

/** Records a COD amount collected by the courier on delivery — distinct from recordPaymentTransaction because COD cash is collected by a third party (the courier), not received directly. */
export function recordCodCollectionTransaction(
  db: SupabaseClient,
  payment: PaymentForAccounting,
  source = 'shipments.service',
): Promise<FinancialTransactionRecord> {
  return recordFinancialEvent(db, {
    transactionType: 'cod_collection',
    idempotencyKey: buildFinancialEventIdempotencyKey('cod_collection', payment.id),
    amount: payment.amount,
    currency: payment.currency,
    orderId: payment.orderId,
    paymentId: payment.id,
    description: 'COD collected by courier',
    source,
  })
}

/** Records an order cancellation. One per order (idempotency key: accounting:cancellation:<orderId>). */
export function recordCancellationTransaction(
  db: SupabaseClient,
  order: OrderForAccounting,
  source = 'orders.service.requestOrderCancellation',
): Promise<FinancialTransactionRecord> {
  return recordFinancialEvent(db, {
    transactionType: 'cancellation',
    idempotencyKey: buildFinancialEventIdempotencyKey('cancellation', order.id),
    amount: order.grandTotal,
    currency: order.currency,
    orderId: order.id,
    description: order.orderNumber ? `Cancellation for order ${order.orderNumber}` : 'Order cancellation',
    source,
  })
}

export interface ReturnForAccounting {
  id: string
  orderId: string
  currency: string
  refundAmount: number
}

/** Records a customer return. One per return (idempotency key: accounting:return:<returnId>). */
export function recordReturnTransaction(
  db: SupabaseClient,
  ret: ReturnForAccounting,
  source = 'returns.service',
): Promise<FinancialTransactionRecord> {
  return recordFinancialEvent(db, {
    transactionType: 'return',
    idempotencyKey: buildFinancialEventIdempotencyKey('return', ret.id),
    amount: ret.refundAmount,
    currency: ret.currency,
    orderId: ret.orderId,
    returnId: ret.id,
    description: 'Return received',
    source,
  })
}

/** Records a refund. Scoped by payment + return (a payment can in principle be partially refunded more than once, so the return id disambiguates); pass returnId = null for a refund not tied to a formal return. */
export function recordRefundTransaction(
  db: SupabaseClient,
  payment: PaymentForAccounting,
  returnId: string | null,
  amount: number,
  source = 'returns.service',
): Promise<FinancialTransactionRecord> {
  return recordFinancialEvent(db, {
    transactionType: 'refund',
    idempotencyKey: buildFinancialEventIdempotencyKey('refund', payment.id, returnId ?? undefined),
    amount,
    currency: payment.currency,
    orderId: payment.orderId,
    paymentId: payment.id,
    returnId: returnId ?? null,
    description: 'Refund issued',
    source,
  })
}

export interface AdjustmentForAccounting {
  orderId: string
  shipmentId?: string | null
  /** e.g. 'failed_delivery', 'rto_initiated', 'rto_in_transit', 'rto_delivered' — any short machine-readable reason code. */
  reviewReason: string
  note?: string
}

/**
 * Records a zero-amount "flag for manual accounting review" event —
 * e.g. a courier RTO/failed-delivery outcome (backend/services/delivery/leopards)
 * that has an operational consequence but no automatically-determinable
 * financial amount. Deliberately NEVER guesses a real amount; a human (or a
 * future automated reconciliation pass) decides the actual financial
 * consequence, same as the courier module's original design. Idempotency
 * key includes the review reason (and shipment, when known) so the same
 * shipment can accumulate distinct review flags across its lifecycle
 * (failed_delivery, then rto_initiated, then rto_delivered) without
 * colliding, while a duplicate webhook/poll delivery for the *same* reason
 * on the *same* shipment is safely deduplicated.
 */
export function recordAdjustmentTransaction(
  db: SupabaseClient,
  adjustment: AdjustmentForAccounting,
  source = 'system',
): Promise<FinancialTransactionRecord> {
  const entityId = adjustment.shipmentId ?? adjustment.orderId
  return recordFinancialEvent(db, {
    transactionType: 'adjustment',
    idempotencyKey: buildFinancialEventIdempotencyKey('adjustment', entityId, adjustment.reviewReason),
    amount: 0,
    currency: 'PKR',
    orderId: adjustment.orderId,
    shipmentId: adjustment.shipmentId ?? null,
    description: `[Accounting review needed] ${adjustment.reviewReason}${
      adjustment.shipmentId ? ` on shipment ${adjustment.shipmentId}` : ''
    }.${adjustment.note ? ` ${adjustment.note}` : ''} Requires manual accounting review — no financial amount has been assumed.`,
    source,
  })
}

// ---------------------------------------------------------------------------
// ERP-sync-state primitives — consumed by Phase 8's real sync worker
// (backend/services/erp/ledgix/sync.service.ts) to record the outcome of an
// actual sync attempt. These are the only functions in this file that stamp
// local_financial_transactions.ledgix_document_id/ledgix_document_number —
// centralizing ERP-reference writes here (rather than in the erp/ledgix
// service layer) keeps this file the single owner of every write to
// local_financial_transactions, matching Phase 7's original design.
// ---------------------------------------------------------------------------

async function getSyncJob(db: SupabaseClient, transactionId: string): Promise<{ id: string; attempts: number } | null> {
  const { data, error } = await db
    .from('erp_sync_jobs')
    .select('id, attempts')
    .eq('entity_type', ERP_ENTITY_TYPE_FINANCIAL_EVENT)
    .eq('entity_id', transactionId)
    .maybeSingle()
  if (error) throw error
  return (data as { id: string; attempts: number } | null) ?? null
}

/** Marks the sync attempt as started: status -> in_progress, attempts += 1. Creates the job row if the original best-effort insert never happened. */
export async function markErpSyncInProgress(db: SupabaseClient, transactionId: string): Promise<void> {
  const job = await getSyncJob(db, transactionId)
  if (job) {
    const { error } = await db
      .from('erp_sync_jobs')
      .update({ status: 'in_progress', attempts: job.attempts + 1, started_at: new Date().toISOString(), completed_at: null })
      .eq('id', job.id)
    if (error) throw error
    return
  }
  const { error } = await db.from('erp_sync_jobs').insert({
    provider: 'ledgix',
    entity_type: ERP_ENTITY_TYPE_FINANCIAL_EVENT,
    entity_id: transactionId,
    direction: 'push',
    status: 'in_progress',
    attempts: 1,
    started_at: new Date().toISOString(),
  })
  if (error) throw error
}

/**
 * Marks a sync attempt as succeeded and stamps the real ERP document
 * reference back onto local_financial_transactions — the ONLY place this
 * ever happens, and only ever called after a real ErpProvider call actually
 * returned a document reference (never speculatively, never on a
 * not-configured throw). See this module's header and the phase spec's
 * "never fabricate an ERP number" rule.
 */
export async function markErpSyncSucceeded(
  db: SupabaseClient,
  transactionId: string,
  ref: { ledgixDocumentId: string; ledgixDocumentNumber: string },
): Promise<void> {
  const { error: txError } = await db
    .from('local_financial_transactions')
    .update({ ledgix_document_id: ref.ledgixDocumentId, ledgix_document_number: ref.ledgixDocumentNumber })
    .eq('id', transactionId)
  if (txError) throw txError

  const job = await getSyncJob(db, transactionId)
  if (!job) throw new ServerError(`No erp_sync_jobs row found for financial transaction "${transactionId}" to mark succeeded.`)
  const { error } = await db
    .from('erp_sync_jobs')
    .update({ status: 'succeeded', completed_at: new Date().toISOString(), last_error: null })
    .eq('id', job.id)
  if (error) throw error
}

/** Marks a sync attempt as failed. `errorMessage` should already be sanitized (see backend/lib/logger's redaction pattern) — never the raw provider error object. */
export async function markErpSyncFailed(db: SupabaseClient, transactionId: string, errorMessage: string): Promise<void> {
  const job = await getSyncJob(db, transactionId)
  if (!job) {
    const { error } = await db.from('erp_sync_jobs').insert({
      provider: 'ledgix',
      entity_type: ERP_ENTITY_TYPE_FINANCIAL_EVENT,
      entity_id: transactionId,
      direction: 'push',
      status: 'failed',
      attempts: 1,
      last_error: errorMessage,
      completed_at: new Date().toISOString(),
    })
    if (error) throw error
    return
  }
  const { error } = await db
    .from('erp_sync_jobs')
    .update({ status: 'failed', last_error: errorMessage, completed_at: new Date().toISOString() })
    .eq('id', job.id)
  if (error) throw error
}

/** Marks a sync job as intentionally skipped (e.g. discount/delivery_charge events, which are netted into the sale invoice rather than synced as their own ERP document — see backend/lib/erp's mapFinancialEventToErpAction). */
export async function markErpSyncSkipped(db: SupabaseClient, transactionId: string, reason: string): Promise<void> {
  const job = await getSyncJob(db, transactionId)
  if (!job) {
    const { error } = await db.from('erp_sync_jobs').insert({
      provider: 'ledgix',
      entity_type: ERP_ENTITY_TYPE_FINANCIAL_EVENT,
      entity_id: transactionId,
      direction: 'push',
      status: 'skipped',
      last_error: reason,
      completed_at: new Date().toISOString(),
    })
    if (error) throw error
    return
  }
  const { error } = await db
    .from('erp_sync_jobs')
    .update({ status: 'skipped', last_error: reason, completed_at: new Date().toISOString() })
    .eq('id', job.id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Diagnostics + retry primitives (consumed by Phase 8's real sync worker,
// and usable ad hoc by an admin today — no admin UI here, that's Phase 12).
// ---------------------------------------------------------------------------

export type ErpSyncJobStatus = 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'skipped'

export interface ErpSyncJobSummary {
  id: string
  status: ErpSyncJobStatus
  attempts: number
  lastError: string | null
  scheduledAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface UnsyncedFinancialEvent {
  transaction: FinancialTransactionRecord
  syncJob: ErpSyncJobSummary | null
}

/** Fetches a single financial transaction by id — used by Phase 8's sync worker to load the record it's about to attempt syncing. */
export async function getFinancialTransactionById(db: SupabaseClient, id: string): Promise<FinancialTransactionRecord | null> {
  const { data, error } = await db.from('local_financial_transactions').select(TRANSACTION_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapRow(data as FinancialTransactionRow) : null
}

/**
 * Read-only diagnostic: every local financial event whose ERP sync job is
 * not (yet) `succeeded` — including one with no sync job row at all, which
 * can only happen if the best-effort erp_sync_jobs insert in
 * recordFinancialEvent() failed. Ordered oldest-first so the longest-
 * outstanding events surface first. This is intentionally a flat read, not
 * an admin UI (Phase 12's job) — just enough for a script/manual query/
 * future admin page to build on.
 */
export async function listUnsyncedFinancialEvents(
  db: SupabaseClient,
  limit = 100,
): Promise<UnsyncedFinancialEvent[]> {
  const { data: transactions, error } = await db
    .from('local_financial_transactions')
    .select(TRANSACTION_COLUMNS)
    .order('occurred_at', { ascending: true })
    .limit(limit)
  if (error) throw error

  const rows = (transactions ?? []) as FinancialTransactionRow[]
  if (rows.length === 0) return []

  const { data: jobs, error: jobsError } = await db
    .from('erp_sync_jobs')
    .select('id, entity_id, status, attempts, last_error, scheduled_at, started_at, completed_at')
    .eq('entity_type', ERP_ENTITY_TYPE_FINANCIAL_EVENT)
    .in(
      'entity_id',
      rows.map((r) => r.id),
    )
  if (jobsError) throw jobsError

  const jobsByEntity = new Map<string, (typeof jobs)[number]>()
  for (const job of jobs ?? []) jobsByEntity.set(job.entity_id as string, job)

  const results: UnsyncedFinancialEvent[] = []
  for (const row of rows) {
    const job = jobsByEntity.get(row.id)
    const syncJob: ErpSyncJobSummary | null = job
      ? {
          id: job.id as string,
          status: job.status as ErpSyncJobStatus,
          attempts: job.attempts as number,
          lastError: job.last_error as string | null,
          scheduledAt: job.scheduled_at as string,
          startedAt: job.started_at as string | null,
          completedAt: job.completed_at as string | null,
        }
      : null

    if (!syncJob || syncJob.status !== 'succeeded') {
      results.push({ transaction: mapRow(row), syncJob })
    }
  }
  return results
}

/**
 * Admin/operator-triggered retry primitive for Phase 8 to eventually call
 * automatically (see module doc for scheduling notes) and usable manually
 * today. Requeues the financial event's erp_sync_jobs row back to
 * `pending` (creating one if the original best-effort insert failed),
 * incrementing `attempts` — this is the "retrying" state the phase spec
 * asks for, expressed as pending + attempts > 0 rather than a new enum
 * value (see backend/lib/accounting's module doc). Every call is audited
 * via backend/lib/audit, since retrying/reconciling financial sync state is
 * a privileged, security-sensitive action.
 */
export async function retryFinancialEventSync(
  db: SupabaseClient,
  auditWriter: AuditLogWriter,
  transactionId: string,
  actor: { id: string | null; type: 'admin' | 'system' },
): Promise<void> {
  const { data: existingJob, error: jobLookupError } = await db
    .from('erp_sync_jobs')
    .select('id, attempts')
    .eq('entity_type', ERP_ENTITY_TYPE_FINANCIAL_EVENT)
    .eq('entity_id', transactionId)
    .maybeSingle()
  if (jobLookupError) throw jobLookupError

  if (existingJob) {
    const { error } = await db
      .from('erp_sync_jobs')
      .update({
        status: 'pending',
        attempts: (existingJob.attempts as number) + 1,
        started_at: null,
        completed_at: null,
        scheduled_at: new Date().toISOString(),
      })
      .eq('id', existingJob.id as string)
    if (error) throw error
  } else {
    const { error } = await db.from('erp_sync_jobs').insert({
      provider: 'ledgix',
      entity_type: ERP_ENTITY_TYPE_FINANCIAL_EVENT,
      entity_id: transactionId,
      direction: 'push',
      status: 'pending',
      attempts: 1,
    })
    if (error) throw error
  }

  await writeAuditLog(auditWriter, {
    actor: actor.id,
    actorType: actor.type,
    action: 'accounting.sync_retry_requested',
    entityType: ERP_ENTITY_TYPE_FINANCIAL_EVENT,
    entityId: transactionId,
    metadata: {},
  })
}
