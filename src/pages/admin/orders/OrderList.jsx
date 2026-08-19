import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCard, EmptyState, ErrorState, LoadingState, Pagination, StatusPill } from '../../../components/admin/ui'
import { listAdminOrders } from '../../../repositories/admin/orders.admin.repository'
import { formatMoney } from '../../../../backend/lib/money/index'

const LIMIT = 25
const STATUSES = ['pending', 'confirmed', 'processing', 'packed', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded']

export default function OrderList() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading' }))
    listAdminOrders({ search: search || undefined, status: status || undefined, limit: LIMIT, offset })
      .then(({ items, total }) => !cancelled && setState({ status: 'ok', items, total }))
      .catch((err) => !cancelled && setState({ status: 'error', items: [], total: 0, error: err?.message }))
    return () => { cancelled = true }
  }, [search, status, offset])

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Orders</h1>
      </header>

      <AdminCard>
        <div className="admin-toolbar">
          <input className="form-input" placeholder="Search order #, email, phone…" value={search} onChange={(e) => { setOffset(0); setSearch(e.target.value) }} />
          <select className="form-select" value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value) }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} />}
        {state.status === 'ok' && state.items.length === 0 && <EmptyState>No orders found.</EmptyState>}
        {state.status === 'ok' && state.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Order</th><th>Customer</th><th>Total</th><th>Order</th><th>Payment</th><th>Fulfillment</th><th>Placed</th></tr>
              </thead>
              <tbody>
                {state.items.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/admin/orders/${o.id}`} className="admin-link">{o.orderNumber}</Link></td>
                    <td>{o.email ?? o.phone ?? '—'}</td>
                    <td>{formatMoney(o.grandTotal, { currency: o.currency })}</td>
                    <td><StatusPill status={o.orderStatus} /></td>
                    <td><StatusPill status={o.paymentStatus} /></td>
                    <td><StatusPill status={o.fulfillmentStatus} /></td>
                    <td>{new Date(o.placedAt).toLocaleDateString()}</td>
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
