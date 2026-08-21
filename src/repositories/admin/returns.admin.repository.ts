/** Admin returns queue/detail/actions — wraps the `returns` Edge Function's admin routes (Phase 14). */
import { callEdgeFunction } from '../../lib/supabase/functions'

export function listReturnsForAdmin(params: { status?: string; limit?: number } = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return callEdgeFunction<any[]>(`returns/admin${qs ? `?${qs}` : ''}`, { method: 'GET' })
}

export function getReturnDetail(id: string) {
  return callEdgeFunction<any>(`returns/${id}`, { method: 'GET' })
}

export function moveReturnUnderReview(id: string, note?: string) {
  return callEdgeFunction<any>(`returns/${id}/review`, { method: 'POST', body: { note } })
}

export function approveReturn(id: string, note?: string) {
  return callEdgeFunction<any>(`returns/${id}/approve`, { method: 'POST', body: { note } })
}

export function rejectReturn(id: string, note?: string) {
  return callEdgeFunction<any>(`returns/${id}/reject`, { method: 'POST', body: { note } })
}

export function markReturnReceived(id: string, note?: string) {
  return callEdgeFunction<any>(`returns/${id}/received`, { method: 'POST', body: { note } })
}

export function recordInspectionOutcome(id: string, input: { resolution: 'refund' | 'replacement'; inspectionNotes?: string; refundAmount?: number }) {
  return callEdgeFunction<any>(`returns/${id}/inspection`, { method: 'POST', body: input })
}

export function closeReturn(id: string, note?: string) {
  return callEdgeFunction<any>(`returns/${id}/close`, { method: 'POST', body: { note } })
}
