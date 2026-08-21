/**
 * CourierProvider — the contract every courier/shipping integration must
 * satisfy. Leopards (backend/lib/providers/leopards/LeopardsCourierProvider.ts)
 * is the planned Phase 11 implementation.
 */

export interface CreateShipmentInput {
  orderId: string
  recipientName: string
  recipientPhone: string
  addressLine1: string
  addressLine2?: string
  city: string
  province?: string
  postalCode?: string
  codAmount?: number // minor units, if cash-on-delivery
}

export interface CreateShipmentResult {
  trackingNumber: string
  awbNumber?: string
  status: 'pending' | 'pickup_requested'
}

export interface TrackShipmentInput {
  trackingNumber: string
}

export interface TrackShipmentResult {
  trackingNumber: string
  /**
   * The PROVIDER'S OWN raw status string, verbatim — not yet normalized
   * into Aura's `shipment_status` vocabulary. We don't have real Leopards
   * API docs to know their exact status vocabulary/casing, so this
   * interface intentionally does not constrain it to a fixed union.
   * Normalization into Aura's own status enum happens one layer up, in
   * backend/services/delivery/leopards/statusNormalization.ts — see that
   * module for the generic-state mapping table and the reasoning for
   * keeping it separate from this provider-facing type.
   */
  status: string
  lastUpdatedAt: string
}

export interface CancelShipmentInput {
  trackingNumber: string
  reason?: string
}

/**
 * Pickup request — kept as a SEPARATE call from createShipment because some
 * couriers separate "book an AWB" from "schedule a physical pickup", but we
 * don't have Leopards' real API docs to confirm whether that's true for
 * them specifically (their booking call may already trigger a pickup, or
 * pickup may need its own confirmation step/cutoff window). Phase 11 models
 * both as distinct provider calls so the calling code isn't rearchitected
 * once real docs are available — worst case, requestPickup becomes a no-op
 * wrapper around createShipment's own result.
 */
export interface RequestPickupInput {
  trackingNumber: string
  pickupDate?: string // ISO date, best-guess field name pending real docs
  pickupAddress?: string
}

export interface RequestPickupResult {
  status: 'pickup_requested'
  pickupReference?: string
}

/**
 * Courier-side booking call shape for a CUSTOMER RETURN pickup (Phase 14
 * drives the "approved" decision this responds to; Phase 11 only builds the
 * courier booking call itself). Origin address is the CUSTOMER's address
 * (the courier picks up from them), destination is implicitly Aura's
 * warehouse — real Leopards docs may require an explicit destination
 * address field we don't have a confirmed name for yet.
 */
export interface BookReturnPickupInput {
  returnId: string
  orderId: string
  recipientName: string
  recipientPhone: string
  addressLine1: string
  addressLine2?: string
  city: string
  province?: string
  postalCode?: string
  itemsDescription?: string
}

export interface BookReturnPickupResult {
  trackingNumber: string
  awbNumber?: string
  status: 'pending' | 'pickup_requested'
}

export interface CourierProvider {
  readonly name: string

  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>
  trackShipment(input: TrackShipmentInput): Promise<TrackShipmentResult>
  cancelShipment(input: CancelShipmentInput): Promise<void>
  requestPickup(input: RequestPickupInput): Promise<RequestPickupResult>
  bookReturnPickup(input: BookReturnPickupInput): Promise<BookReturnPickupResult>
}
