import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCard, EmptyState, ErrorState, LoadingState, StatusPill } from '../../../components/admin/ui'
import { listReturnsForAdmin } from '../../../repositories/admin/returns.admin.repository'

const STATUSES = ['', 'requested', 'under_review', 'approved', 'rejected', 'pickup_requested', 'in_transit', 'received', 'refunded', 'replaced', 'closed']

export default function ReturnsQueue() {
  const [status, setStatus] = useState('')
  const [state, setState] = useState({ status: 'loading', items: [] })

  function reload() {
    setState({ status: 'loading', items: [] })
    listReturnsForAdmin({ status: status || undefined, limit: 100 })
      .then((items) => setState({ status: 'ok', items }))
      .catch((err) => setState({ status: 'error', items: [], error: err?.message }))
  }

  useEffect(reload, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Returns</h1>
      </header>

      <AdminCard>
        <div className="admin-toolbar">
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All statuses'}</option>)}
          </select>
        </div>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} onRetry={reload} />}
        {state.status === 'ok' && state.items.length === 0 && <EmptyState>No returns found.</EmptyState>}
        {state.status === 'ok' && state.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Return #</th><th>Reason</th><th>Status</th><th>Resolution</th><th>Created</th></tr></thead>
              <tbody>
                {state.items.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/admin/returns/${r.id}`} className="admin-link">{r.returnNumber}</Link></td>
                    <td>{r.reason ?? '—'}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td>{r.resolution ?? '—'}</td>
                    <td>{new Date(r.createdAt).toLocaleDateString()}</td>
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
