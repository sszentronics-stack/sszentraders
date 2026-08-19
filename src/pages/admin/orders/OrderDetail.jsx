import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdminCard, ErrorState, LoadingState, StatusPill, useConfirm } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import { getOrder, cancelOrder } from '../../../repositories/orders.repository'
import { getOrderTrackingTimeline } from '../../../repositories/admin/shipments.admin.repository'
import { formatMoney } from '../../../../backend/lib/money/index'

const CANCELLABLE = ['pending', 'confirmed']

export default function OrderDetail() {
  const { id } = useParams()
  const toast = useAdminToast()
  const { confirm, dialog } = useConfirm()
  const [state, setState] = useState({ status: 'loading', order: null, error: null })
  const [tracking, setTracking] = useState(null)

  async function reload() {
    try {
      const order = await getOrder(id)
      setState({ status: 'ok', order, error: null })
    } catch (err) {
      setState({ status: 'error', order: null, error: err?.message })
    }
    getOrderTrackingTimeline(id).then(setTracking).catch(() => setTracking(null))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (state.status === 'loading') return <div className="admin-page"><LoadingState /></div>
  if (state.status === 'error') return <div className="admin-page"><ErrorState message={state.error} onRetry={reload} /></div>

  const o = state.order

  async function handleCancel() {
    const ok = await confirm({ title: 'Request cancellation for this order?', body: 'This follows the same request-cancellation rules customers use.', confirmLabel: 'Request cancellation', danger: true })
    if (!ok) return
    try {
      await cancelOrder(id)
      toast.success('Cancellation requested.')
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to request cancellation.')
    }
  }

  const addr = o.shippingAddress ?? {}

  return (
    <div className="admin-page">
      {dialog}
      <header className="admin-page-header">
        <h1>Order {o.orderNumber}</h1>
        <div className="admin-header-actions">
          <StatusPill status={o.orderStatus} />
          {CANCELLABLE.includes(o.orderStatus) && (
            <button type="button" className="admin-btn admin-btn-danger" onClick={handleCancel}>Request cancellation</button>
          )}
        </div>
      </header>

      <div className="admin-grid-2">
        <AdminCard title="Customer & shipping">
          <dl className="admin-dl">
            <dt>Email</dt><dd>{o.email ?? '—'}</dd>
            <dt>Phone</dt><dd>{o.phone ?? '—'}</dd>
            <dt>Recipient</dt><dd>{addr.recipientName ?? '—'}</dd>
            <dt>Address</dt>
            <dd>{[addr.addressLine1, addr.addressLine2, addr.city, addr.province, addr.postalCode, addr.country].filter(Boolean).join(', ') || '—'}</dd>
            <dt>Delivery method</dt><dd>{o.deliveryMethod ?? '—'}</dd>
            <dt>Notes</dt><dd>{o.customerNotes ?? '—'}</dd>
          </dl>
        </AdminCard>

        <AdminCard title="Status">
          <dl className="admin-dl">
            <dt>Order status</dt><dd><StatusPill status={o.orderStatus} /></dd>
            <dt>Payment status</dt><dd><StatusPill status={o.paymentStatus} /></dd>
            <dt>Fulfillment status</dt><dd><StatusPill status={o.fulfillmentStatus} /></dd>
            <dt>Payment method</dt><dd>{o.paymentMethod ?? '—'}</dd>
            <dt>Placed</dt><dd>{new Date(o.placedAt).toLocaleString()}</dd>
          </dl>
        </AdminCard>
      </div>

      <AdminCard title="Items">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead>
            <tbody>
              {o.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.sku}</td>
                  <td>{it.productName}{it.variantName ? ` — ${it.variantName}` : ''}</td>
                  <td>{it.quantity}</td>
                  <td>{formatMoney(it.unitPrice, { currency: o.currency })}</td>
                  <td>{formatMoney(it.lineTotal, { currency: o.currency })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="admin-dl admin-totals">
          <dt>Subtotal</dt><dd>{formatMoney(o.subtotal, { currency: o.currency })}</dd>
          <dt>Discount</dt><dd>-{formatMoney(o.discountTotal, { currency: o.currency })}</dd>
          <dt>Shipping</dt><dd>{formatMoney(o.shippingTotal, { currency: o.currency })}</dd>
          <dt>Tax</dt><dd>{formatMoney(o.taxTotal, { currency: o.currency })}</dd>
          <dt><strong>Grand total</strong></dt><dd><strong>{formatMoney(o.grandTotal, { currency: o.currency })}</strong></dd>
        </dl>
      </AdminCard>

      {tracking?.shipments?.length > 0 && (
        <AdminCard title="Shipment tracking">
          {tracking.shipments.map((shipment) => (
            <div key={shipment.shipmentId} className="admin-shipment-block">
              <p>
                <strong>{shipment.purpose === 'return' ? 'Return shipment' : 'Outbound shipment'}</strong>{' '}
                {shipment.trackingNumber && <span className="admin-muted">AWB {shipment.trackingNumber}</span>}{' '}
                <StatusPill status={shipment.currentStatus} />
              </p>
              <ul className="admin-timeline">
                {shipment.events.map((ev, i) => (
                  <li key={i}>
                    <StatusPill status={ev.status ?? ev.eventType} />{' '}
                    <time>{new Date(ev.occurredAt).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </AdminCard>
      )}
    </div>
  )
}
