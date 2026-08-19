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
  status:
    | 'pending'
    | 'pickup_requested'
    | 'picked_up'
    | 'in_transit'
    | 'out_for_delivery'
    | 'delivered'
    | 'failed_delivery'
    | 'returned'
    | 'cancelled'
  lastUpdatedAt: string
}

export interface CancelShipmentInput {
  trackingNumber: string
  reason?: string
}

export interface CourierProvider {
  readonly name: string

  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>
  trackShipment(input: TrackShipmentInput): Promise<TrackShipmentResult>
  cancelShipment(input: CancelShipmentInput): Promise<void>
}
