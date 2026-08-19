/**
 * Courier status normalization layer — Phase 11.
 *
 * This is real, load-bearing logic even though no live Leopards tracking
 * data exists yet: it maps a GENERIC courier-state vocabulary (the kind
 * every Pakistani courier roughly shares — "booked", "picked up", "in
 * transit", "out for delivery", "delivered", "failed delivery", "RTO
 * initiated/in transit/delivered") onto Aura's own `shipment_status`
 * Postgres enum (supabase/migrations/0001_extensions_and_enums.sql,
 * extended by 0019_leopards_shipments.sql), and decides whether an incoming
 * status update should actually be applied — protecting against stale/
 * out-of-order webhook or polling updates.
 *
 * IMPORTANT: the raw string keys in RAW_STATUS_MAP are a best-guess
 * vocabulary, NOT confirmed Leopards field values — there is no real
 * Leopards API documentation in this project. Once real docs/credentials
 * exist, only this map (and the field Leopards actually calls its status
 * value) needs updating — the transition/staleness logic below does not
 * change.
 */

/** Aura's own shipment lifecycle — must stay in sync with the `shipment_status` Postgres enum. */
export const SHIPMENT_STATUSES = [
  'pending_booking',
  'pending',
  'pickup_requested',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'returned',
  'cancelled',
  'rto_initiated',
  'rto_in_transit',
  'rto_delivered',
] as const

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

export function isShipmentStatus(value: string): value is ShipmentStatus {
  return (SHIPMENT_STATUSES as readonly string[]).includes(value)
}

/**
 * Generic courier states this normalization layer understands, independent
 * of any single provider's exact field names/casing.
 */
export const GENERIC_COURIER_STATES = [
  'booked',
  'pickup_requested',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'rto_initiated',
  'rto_in_transit',
  'rto_delivered',
  'cancelled',
] as const

export type GenericCourierState = (typeof GENERIC_COURIER_STATES)[number]

const GENERIC_TO_AURA: Record<GenericCourierState, ShipmentStatus> = {
  booked: 'pending',
  pickup_requested: 'pickup_requested',
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  failed_delivery: 'failed_delivery',
  rto_initiated: 'rto_initiated',
  rto_in_transit: 'rto_in_transit',
  rto_delivered: 'rto_delivered',
  cancelled: 'cancelled',
}

/**
 * Best-guess raw-provider-string synonyms -> our GenericCourierState. This
 * is deliberately permissive (case-insensitive, whitespace/underscore/dash
 * tolerant) because we do not know Leopards' real casing/wording. Extend
 * this map — never the transition logic — once real sample payloads exist.
 */
const RAW_STATUS_SYNONYMS: Record<string, GenericCourierState> = {
  booked: 'booked',
  shipmentbooked: 'booked',
  pickuprequested: 'pickup_requested',
  pickedup: 'picked_up',
  intransit: 'in_transit',
  outfordelivery: 'out_for_delivery',
  delivered: 'delivered',
  faileddelivery: 'failed_delivery',
  deliveryfailed: 'failed_delivery',
  rtoinitiated: 'rto_initiated',
  returntooriginshipper: 'rto_initiated',
  rtointransit: 'rto_in_transit',
  rtodelivered: 'rto_delivered',
  returned: 'rto_delivered',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

function slugifyRawStatus(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * Normalize a raw provider status string into our GenericCourierState, or
 * null when it isn't recognized (unknown statuses are never silently
 * mapped to something plausible-looking — callers must keep the raw value
 * for diagnostics and can choose to alert/log on an unrecognized status).
 */
export function normalizeRawCourierStatus(rawStatus: string): GenericCourierState | null {
  const key = slugifyRawStatus(rawStatus)
  return RAW_STATUS_SYNONYMS[key] ?? null
}

export function genericStateToShipmentStatus(state: GenericCourierState): ShipmentStatus {
  return GENERIC_TO_AURA[state]
}

/**
 * Allowed forward transitions for shipment_status, mirroring
 * backend/lib/status's ORDER_TRANSITIONS pattern. Terminal states have no
 * outgoing transitions. `failed_delivery` can go either back into transit
 * (a redelivery attempt) or into the RTO branch — both are real courier
 * behaviors, not a design choice we're inventing.
 */
const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  pending_booking: ['pending', 'cancelled'],
  pending: ['pickup_requested', 'picked_up', 'cancelled'],
  pickup_requested: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'cancelled'],
  in_transit: ['out_for_delivery', 'failed_delivery', 'delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'failed_delivery'],
  failed_delivery: ['in_transit', 'out_for_delivery', 'rto_initiated'],
  rto_initiated: ['rto_in_transit', 'rto_delivered'],
  rto_in_transit: ['rto_delivered'],
  rto_delivered: [],
  delivered: [],
  returned: [],
  cancelled: [],
}

export function canTransitionShipmentStatus(from: ShipmentStatus, to: ShipmentStatus): boolean {
  if (from === to) return true // idempotent re-application of the same status (e.g. a repeated webhook) is fine
  return SHIPMENT_TRANSITIONS[from].includes(to)
}

export type ShipmentStatusUpdateDecision =
  | { action: 'apply'; normalizedStatus: ShipmentStatus; genericState: GenericCourierState }
  | { action: 'ignore_unknown_status'; reason: string }
  | { action: 'ignore_stale_event'; reason: string }
  | { action: 'ignore_invalid_transition'; reason: string; normalizedStatus: ShipmentStatus }

export interface ResolveShipmentStatusUpdateInput {
  currentStatus: ShipmentStatus
  /** ISO timestamp of the last applied event, if any — protects against out-of-order delivery of updates. */
  lastEventAt: string | null
  rawStatus: string
  /** ISO timestamp the provider says this status was observed at. */
  eventAt: string
}

/**
 * The single decision point every tracking-sync/webhook code path should
 * funnel through: given the shipment's current normalized status and the
 * timestamp of its last applied event, decide what an incoming raw
 * provider status update should do. Never mutates anything — pure decision
 * logic, DB writes happen in tracking.service.ts.
 */
export function resolveShipmentStatusUpdate(input: ResolveShipmentStatusUpdateInput): ShipmentStatusUpdateDecision {
  const genericState = normalizeRawCourierStatus(input.rawStatus)
  if (!genericState) {
    return { action: 'ignore_unknown_status', reason: `Unrecognized raw courier status: "${input.rawStatus}"` }
  }

  const normalizedStatus = genericStateToShipmentStatus(genericState)

  if (input.lastEventAt) {
    const lastEventTime = Date.parse(input.lastEventAt)
    const incomingEventTime = Date.parse(input.eventAt)
    if (Number.isFinite(lastEventTime) && Number.isFinite(incomingEventTime) && incomingEventTime < lastEventTime) {
      return {
        action: 'ignore_stale_event',
        reason: `Incoming event (${input.eventAt}) is older than the last applied event (${input.lastEventAt}) — likely an out-of-order delivery.`,
      }
    }
  }

  if (!canTransitionShipmentStatus(input.currentStatus, normalizedStatus)) {
    return {
      action: 'ignore_invalid_transition',
      reason: `"${input.currentStatus}" -> "${normalizedStatus}" is not an allowed shipment status transition.`,
      normalizedStatus,
    }
  }

  return { action: 'apply', normalizedStatus, genericState }
}

/** Statuses that should trigger an operational/accounting review flag rather than an automatic financial guess. */
export const REVIEW_TRIGGERING_STATUSES: readonly ShipmentStatus[] = [
  'failed_delivery',
  'rto_initiated',
  'rto_in_transit',
  'rto_delivered',
]

export function requiresAccountingReview(status: ShipmentStatus): boolean {
  return REVIEW_TRIGGERING_STATUSES.includes(status)
}
