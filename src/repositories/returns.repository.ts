/**
 * Returns data access — Phase 14. Thin wrapper around the `returns` Edge
 * Function (backend/services/reviews/returns.service.ts). Every eligibility/
 * amount/status decision happens server-side; this file never asserts any
 * of that itself.
 */
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import { callEdgeFunction } from '../lib/supabase/functions'

export type ReturnReasonCode =
  | 'damaged_in_transit'
  | 'wrong_item_received'
  | 'not_as_described'
  | 'defective_quality'
  | 'changed_mind'
  | 'size_fit_issue'
  | 'other'

export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
  damaged_in_transit: 'Arrived damaged',
  wrong_item_received: 'Received the wrong item',
  not_as_described: 'Not as described',
  defective_quality: 'Quality issue / defective',
  changed_mind: 'Changed my mind',
  size_fit_issue: 'Size or fit issue',
  other: 'Other',
}

export const REASON_CODES_REQUIRING_EVIDENCE: ReadonlySet<ReturnReasonCode> = new Set([
  'damaged_in_transit',
  'wrong_item_received',
  'not_as_described',
  'defective_quality',
])

export const RETURN_STATUS_LABEL: Record<string, string> = {
  requested: 'Requested',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  pickup_requested: 'Pickup requested',
  in_transit: 'In transit',
  received: 'Received',
  refunded: 'Refunded',
  replaced: 'Replacement issued',
  closed: 'Closed',
}

export interface ReturnableItem {
  orderItemId: string
  productName: string
  variantName: string | null
  purchasedQuantity: number
  remainingEligibleQuantity: number
  unitPrice: number
}

export function listReturnableItemsForOrder(orderId: string): Promise<ReturnableItem[]> {
  return callEdgeFunction<ReturnableItem[]>(`returns/order/${orderId}/eligible-items`, { method: 'GET' })
}

/** Requests a signed upload URL and uploads the file directly to the private return-evidence bucket. Returns the storagePath to include in the return request payload. */
export async function uploadReturnEvidence(orderItemId: string, file: File): Promise<string> {
  const { path, token } = await callEdgeFunction<{ path: string; signedUrl: string; token: string }>('returns/evidence/upload-url', {
    method: 'POST',
    body: { orderItemId, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
  })

  const { error } = await getSupabaseBrowserClient().storage.from('return-evidence').uploadToSignedUrl(path, token, file)
  if (error) throw new Error(error.message)
  return path
}

export interface ReturnRequestLine {
  orderItemId: string
  quantity: number
  reasonCode: ReturnReasonCode
  notes?: string
  evidenceStoragePaths: string[]
}

export interface CreateReturnRequestInput {
  orderId: string
  customerNotes?: string
  items: ReturnRequestLine[]
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
  fromStatus: string | null
  toStatus: string
  note: string | null
  createdAt: string
}

export interface ReturnRecord {
  id: string
  orderId: string
  returnNumber: string
  status: string
  reason: string | null
  customerNotes: string | null
  refundAmount: number | null
  resolution: 'refund' | 'replacement' | null
  inspectionOutcome: string | null
  inspectionNotes: string | null
  refundMethod: 'easypaisa' | 'manual' | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  items: ReturnItemRecord[]
  events: ReturnEventRecord[]
}

export function createReturnRequest(input: CreateReturnRequestInput): Promise<ReturnRecord> {
  return callEdgeFunction<ReturnRecord>('returns', { method: 'POST', body: input })
}

export async function listMyReturns(): Promise<ReturnRecord[]> {
  const { returns } = await callEdgeFunction<{ returns: ReturnRecord[] }>('returns', { method: 'GET' })
  return returns
}

export function getReturn(returnId: string): Promise<ReturnRecord> {
  return callEdgeFunction<ReturnRecord>(`returns/${returnId}`, { method: 'GET' })
}
