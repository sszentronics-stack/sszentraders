import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCard, EmptyState, ErrorState, LoadingState, Pagination, StatusPill } from '../../../components/admin/ui'
import { listAdminProducts } from '../../../repositories/admin/products.admin.repository'

const LIMIT = 25

export default function ProductList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading' }))
    listAdminProducts({ search: search || undefined, status: status || undefined, limit: LIMIT, offset })
      .then(({ items, total }) => !cancelled && setState({ status: 'ok', items, total }))
      .catch((err) => !cancelled && setState({ status: 'error', items: [], total: 0, error: err?.message }))
    return () => {
      cancelled = true
    }
  }, [search, status, offset])

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Products</h1>
        <Link to="/admin/products/new" className="admin-btn admin-btn-primary">
          New product
        </Link>
      </header>

      <AdminCard>
        <div className="admin-toolbar">
          <input className="form-input" placeholder="Search by name…" value={search} onChange={(e) => { setOffset(0); setSearch(e.target.value) }} />
          <select className="form-select" value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value) }}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} />}
        {state.status === 'ok' && state.items.length === 0 && <EmptyState>No products found.</EmptyState>}
        {state.status === 'ok' && state.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Brand</th>
                  <th>Variants</th>
                  <th>Status</th>
                  <th>Featured</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/admin/products/${p.id}`} className="admin-link">
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.brandName ?? '—'}</td>
                    <td>{p.variantCount}</td>
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td>{p.isFeatured ? 'Yes' : ''}</td>
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
