import { useEffect, useState } from 'react'
import { AdminCard, EmptyState, ErrorState, LoadingState, StatusPill, useConfirm } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import { listReviewsForModeration, moderateReview } from '../../../repositories/admin/reviews.admin.repository'

export default function ReviewsQueue() {
  const [status, setStatus] = useState('pending')
  const [state, setState] = useState({ status: 'loading', items: [] })
  const toast = useAdminToast()
  const { confirm, dialog } = useConfirm()

  function reload() {
    setState({ status: 'loading', items: [] })
    listReviewsForModeration({ status: status || undefined, limit: 100 })
      .then((items) => setState({ status: 'ok', items }))
      .catch((err) => setState({ status: 'error', items: [], error: err?.message }))
  }

  useEffect(reload, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleModerate(id, next) {
    const ok = await confirm({ title: next === 'published' ? 'Publish this review?' : 'Reject this review?', danger: next === 'rejected' })
    if (!ok) return
    try {
      await moderateReview(id, { status: next })
      toast.success(`Review ${next}.`)
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to moderate review.')
    }
  }

  return (
    <div className="admin-page">
      {dialog}
      <header className="admin-page-header">
        <h1>Reviews</h1>
      </header>

      <AdminCard>
        <div className="admin-toolbar">
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="published">Published</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </div>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} onRetry={reload} />}
        {state.status === 'ok' && state.items.length === 0 && <EmptyState>No reviews found.</EmptyState>}
        {state.status === 'ok' && state.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Rating</th><th>Title</th><th>Body</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {state.items.map((r) => (
                  <tr key={r.id}>
                    <td>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</td>
                    <td>{r.title ?? '—'}</td>
                    <td className="admin-truncate">{r.body ?? '—'}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="admin-table-actions">
                      {r.status !== 'published' && <button type="button" className="admin-link-btn" onClick={() => handleModerate(r.id, 'published')}>Publish</button>}
                      {r.status !== 'rejected' && <button type="button" className="admin-link-btn admin-link-btn-danger" onClick={() => handleModerate(r.id, 'rejected')}>Reject</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  )
}
