import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminBreadcrumb, AdminCard, ErrorState, LoadingState, StatusPill } from '../../../components/admin/ui'
import { getAdminCustomerDetail } from '../../../repositories/admin/customers.admin.repository'
import { formatMoney } from '../../../../backend/lib/money/index'

export default function CustomerDetail() {
  const { id } = useParams()
  const [state, setState] = useState({ status: 'loading', customer: null, error: null })

  function reload() {
    setState({ status: 'loading', customer: null, error: null })
    getAdminCustomerDetail(id)
      .then((customer) => setState({ status: 'ok', customer, error: null }))
      .catch((err) => setState({ status: 'error', customer: null, error: err?.message }))
  }

  useEffect(reload, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state.status === 'loading') return <div className="admin-page"><LoadingState /></div>
  if (state.status === 'error') return <div className="admin-page"><ErrorState message={state.error} onRetry={reload} /></div>
  if (!state.customer) return <div className="admin-page"><ErrorState message="Customer not found." /></div>

  const c = state.customer

  return (
    <div className="admin-page">
      <AdminBreadcrumb to="/admin/customers" label="Customers" />
      <header className="admin-page-header">
        <h1>{[c.firstName, c.lastName].filter(Boolean).join(' ') || c.customerNumber}</h1>
        <StatusPill status={c.status} />
      </header>

      <div className="admin-grid-2">
        <AdminCard title="Profile">
          <dl className="admin-dl">
            <dt>Customer #</dt><dd>{c.customerNumber}</dd>
            <dt>Email</dt><dd>{c.email ?? '—'}</dd>
            <dt>Phone</dt><dd>{c.phone ?? '—'}</dd>
            <dt>Date of birth</dt><dd>{c.dateOfBirth ? new Date(c.dateOfBirth).toLocaleDateString() : '—'}</dd>
            <dt>Account</dt><dd>{c.hasAccount ? 'Registered' : 'Guest'}</dd>
            <dt>Marketing consent</dt><dd>{c.marketingOptIn ? 'Opted in' : 'Opted out'}</dd>
            <dt>Customer since</dt><dd>{new Date(c.createdAt).toLocaleDateString()}</dd>
          </dl>
        </AdminCard>

        <AdminCard title="Addresses">
          {c.addresses.length === 0 && <p className="admin-muted">No saved addresses.</p>}
          {c.addresses.map((a) => (
            <div key={a.id} className="address-card">
              <div className="address-card-badges">
                {a.isDefaultShipping && <span className="address-badge">Default shipping</span>}
                {a.isDefaultBilling && <span className="address-badge">Default billing</span>}
              </div>
              <p>{a.recipientName} · {a.phone}</p>
              <p>{[a.addressLine1, a.addressLine2, a.city, a.province, a.postalCode, a.country].filter(Boolean).join(', ')}</p>
            </div>
          ))}
        </AdminCard>
      </div>

      <AdminCard title="Order history">
        {c.orders.length === 0 && <p className="admin-muted">No orders yet.</p>}
        {c.orders.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Order</th><th>Status</th><th>Total</th><th>Placed</th></tr></thead>
              <tbody>
                {c.orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/admin/orders/${o.id}`} className="admin-link">{o.orderNumber}</Link></td>
                    <td><StatusPill status={o.orderStatus} /></td>
                    <td>{formatMoney(o.grandTotal, { currency: o.currency })}</td>
                    <td>{new Date(o.placedAt).toLocaleDateString()}</td>
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
