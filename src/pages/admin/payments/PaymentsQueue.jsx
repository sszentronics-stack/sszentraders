import { useEffect, useState } from 'react'
import { AdminCard, EmptyState, ErrorState, LoadingState, StatusPill, useConfirm } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import { listPaymentsNeedingAttention, getPaymentReconciliationDetail, refundEasypaisaPayment } from '../../../repositories/admin/payments.admin.repository'
import { formatMoney, toMinorUnits } from '../../../../backend/lib/money/index'

export default function PaymentsQueue() {
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [refundAmount, setRefundAmount] = useState('')
  const toast = useAdminToast()
  const { confirm, dialog } = useConfirm()

  function reload() {
    setState({ status: 'loading', items: [] })
    listPaymentsNeedingAttention(50)
      .then((items) => setState({ status: 'ok', items }))
      .catch((err) => setState({ status: 'error', items: [], error: err?.message }))
  }

  useEffect(reload, [])

  function openDetail(payment) {
    setSelected(payment)
    setDetail({ status: 'loading' })
    getPaymentReconciliationDetail(payment.id)
      .then((d) => setDetail({ status: 'ok', data: d }))
      .catch((err) => setDetail({ status: 'error', error: err?.message }))
  }

  async function handleRefund() {
    if (!selected || !refundAmount) return
    const ok = await confirm({
      title: `Refund ${formatMoney(toMinorUnits(Number(refundAmount)), { currency: selected.currency })}?`,
      body: 'This initiates a real Easypaisa refund attempt for this payment.',
      confirmLabel: 'Refund',
      danger: true,
    })
    if (!ok) return
    try {
      await refundEasypaisaPayment({ paymentId: selected.id, amount: toMinorUnits(Number(refundAmount)) })
      toast.success('Refund initiated.')
      setRefundAmount('')
      openDetail(selected)
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Refund failed.')
    }
  }

  return (
    <div className="admin-page">
      {dialog}
      <header className="admin-page-header">
        <h1>Payments</h1>
      </header>

      <div className="admin-grid-2">
        <AdminCard title="Needing attention">
          {state.status === 'loading' && <LoadingState />}
          {state.status === 'error' && <ErrorState message={state.error} onRetry={reload} />}
          {state.status === 'ok' && state.items.length === 0 && <EmptyState>Nothing needs attention.</EmptyState>}
          {state.status === 'ok' && state.items.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Order</th><th>Provider</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {state.items.map((p) => (
                    <tr key={p.id} className={selected?.id === p.id ? 'is-selected' : ''}>
                      <td>{p.orderNumber ?? p.orderId}</td>
                      <td>{p.provider}</td>
                      <td>{formatMoney(p.amount, { currency: p.currency })}</td>
                      <td><StatusPill status={p.status} /></td>
                      <td><button type="button" className="admin-link-btn" onClick={() => openDetail(p)}>Details</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        <AdminCard title={selected ? `Reconciliation — ${selected.provider}` : 'Reconciliation'}>
          {!selected && <p className="admin-muted">Select a payment to view its reconciliation detail.</p>}
          {selected && detail?.status === 'loading' && <LoadingState />}
          {selected && detail?.status === 'error' && <ErrorState message={detail.error} />}
          {selected && detail?.status === 'ok' && (
            <>
              <dl className="admin-dl">
                <dt>Provider transaction</dt><dd>{detail.data.payment.providerTransactionId ?? '—'}</dd>
                <dt>Status</dt><dd><StatusPill status={detail.data.payment.status} /></dd>
                <dt>Amount</dt><dd>{formatMoney(detail.data.payment.amount, { currency: detail.data.payment.currency })}</dd>
                <dt>Refunded</dt><dd>{formatMoney(detail.data.payment.refundedAmount, { currency: detail.data.payment.currency })}</dd>
              </dl>
              <h4 className="admin-form-subheading">Events</h4>
              <ul className="admin-timeline">
                {detail.data.events.map((ev) => (
                  <li key={ev.id}><StatusPill status={ev.status} /> {ev.eventType} <time>{new Date(ev.createdAt).toLocaleString()}</time></li>
                ))}
              </ul>
              {detail.data.payment.status === 'paid' || detail.data.payment.status === 'partially_refunded' ? (
                <div className="admin-form-inline">
                  <input
                    className="form-input"
                    type="number" min="0" step="0.01"
                    placeholder="Refund amount"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                  <span className="admin-muted">of {formatMoney(detail.data.payment.amount - detail.data.payment.refundedAmount, { currency: detail.data.payment.currency })} available</span>
                  <button type="button" className="admin-btn admin-btn-danger" onClick={handleRefund} disabled={!refundAmount}>
                    Refund
                  </button>
                </div>
              ) : null}
            </>
          )}
        </AdminCard>
      </div>
    </div>
  )
}
