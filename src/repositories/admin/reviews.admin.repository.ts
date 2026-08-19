/** Admin review moderation queue — wraps the `reviews` Edge Function's admin routes (Phase 14). */
import { callEdgeFunction } from '../../lib/supabase/functions'

export function listReviewsForModeration(params: { status?: string; limit?: number } = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return callEdgeFunction<any[]>(`reviews/admin${qs ? `?${qs}` : ''}`, { method: 'GET' })
}

export function moderateReview(id: string, input: { status: 'published' | 'rejected'; moderationNote?: string }) {
  return callEdgeFunction<any>(`reviews/${id}/moderate`, { method: 'POST', body: input })
}
