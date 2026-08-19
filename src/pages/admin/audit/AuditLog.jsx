import { useEffect, useState } from 'react'
import { AdminCard, EmptyState, ErrorState, LoadingState, Pagination } from '../../../components/admin/ui'
import { listAuditLogs } from '../../../repositories/admin/auditLog.admin.repository'

const LIMIT = 50

export default function AuditLog() {
  const [action, setAction] = useState('')
  const [actorType, setActorType] = useState('')
  const [offset, setOffset] = useState(0)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading' }))
    listAuditLogs({ action: action || undefined, actorType: actorType || undefined, limit: LIMIT, offset })
      .then(({ items, total }) => !cancelled && setState({ status: 'ok', items, total }))
      .catch((err) => !cancelled && setState({ status: 'error', items: [], total: 0, error: err?.message }))
    return () => { cancelled = true }
  }, [action, actorType, offset])

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Audit Log</h1>
      </header>

      <AdminCard>
        <div className="admin-toolbar">
          <input className="form-input" placeholder="Filter by action (e.g. admin.product)…" value={action} onChange={(e) => { setOffset(0); setAction(e.target.value) }} />
          <select className="form-select" value={actorType} onChange={(e) => { setOffset(0); setActorType(e.target.value) }}>
            <option value="">All actors</option>
            <option value="admin">Admin</option>
            <option value="customer">Customer</option>
            <option value="system">System</option>
            <option value="integration">Integration</option>
          </select>
        </div>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} />}
        {state.status === 'ok' && state.items.length === 0 && <EmptyState>No matching audit entries.</EmptyState>}
        {state.status === 'ok' && state.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
              <tbody>
                {state.items.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleString()}</td>
                    <td>{e.actorType}</td>
                    <td>{e.action}</td>
                    <td>{e.entityType ? `${e.entityType} ${e.entityId?.slice(0, 8) ?? ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination offset={offset} limit={LIMIT} total={state.total} onChange={setOffset} />
      </AdminCard>
    </div>
  )
}
