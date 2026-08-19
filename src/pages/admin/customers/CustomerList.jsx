import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCard, EmptyState, ErrorState, LoadingState, Pagination, StatusPill } from '../../../components/admin/ui'
import { listAdminCustomers } from '../../../repositories/admin/customers.admin.repository'

const LIMIT = 25

export default function CustomerList() {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading' }))
    listAdminCustomers({ search: search || undefined, limit: LIMIT, offset })
      .then(({ items, total }) => !cancelled && setState({ status: 'ok', items, total }))
      .catch((err) => !cancelled && setState({ status: 'error', items: [], total: 0, error: err?.message }))
    return () => { cancelled = true }
  }, [search, offset])

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Customers</h1>
      </header>

      <AdminCard>
        <div className="admin-toolbar">
          <input className="form-input" placeholder="Search name, email, phone…" value={search} onChange={(e) => { setOffset(0); setSearch(e.target.value) }} />
        </div>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} />}
        {state.status === 'ok' && state.items.length === 0 && <EmptyState>No customers found.</EmptyState>}
        {state.status === 'ok' && state.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Customer #</th><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Marketing</th></tr></thead>
              <tbody>
                {state.items.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/admin/customers/${c.id}`} className="admin-link">{c.customerNumber}</Link></td>
                    <td>{[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td>{c.email ?? '—'}</td>
                    <td>{c.phone ?? '—'}</td>
                    <td><StatusPill status={c.status} /></td>
                    <td>{c.marketingOptIn ? 'Opted in' : ''}</td>
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
