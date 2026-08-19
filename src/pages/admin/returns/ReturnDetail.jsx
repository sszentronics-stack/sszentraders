import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdminCard, ErrorState, LoadingState, StatusPill, useConfirm } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import {
  getReturnDetail, moveReturnUnderReview, approveReturn, rejectReturn, markReturnReceived, recordInspectionOutcome, closeReturn,
} from '../../../repositories/admin/returns.admin.repository'
import { formatMoney, toMinorUnits } from '../../../../backend/lib/money/index'

export default function ReturnDetail() {
  const { id } = useParams()
  const toast = useAdminToast()
  const { confirm, dialog } = useConfirm()
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [note, setNote] = useState('')
  const [inspection, setInspection] = useState({ resolution: 'refund', notes: '', refundAmount: '' })
  const [busy, setBusy] = useState(false)

  function reload() {
    getReturnDetail(id)
      .then((data) => setState({ status: 'ok', data, error: null }))
      .catch((err) => setState({ status: 'error', data: null, error: err?.message }))
  }

  useEffect(reload, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state.status === 'loading') return <div className="admin-page"><LoadingState /></div>
  if (state.status === 'error') return <div className="admin-page"><ErrorState message={state.error} onRetry={reload} /></div>

  const r = state.data

  async function run(action, label, fn, danger = false) {
    const ok = await confirm({ title: label, danger })
    if (!ok) return
    setBusy(true)
    try {
      await fn()
      toast.success(`${label} done.`)
      setNote('')
      reload()
    } catch (err) {
      toast.error(err?.message ?? `${label} failed.`)
    } finally {
      setBusy(false)
    }
  }

  async function handleInspection() {
    if (inspection.resolution === 'refund' && !inspection.refundAmount) {
      toast.error('Refund amount is required.')
      return
    }
    const ok = await confirm({
      title: inspection.resolution === 'refund' ? 'Record inspection and process refund?' : 'Record inspection as replacement?',
      body: inspection.resolution === 'refund' ? 'This triggers the real refund flow (Easypaisa/manual + ERP credit note).' : undefined,
      danger: inspection.resolution === 'refund',
      confirmLabel: 'Confirm',
    })
    if (!ok) return
    setBusy(true)
    try {
      await recordInspectionOutcome(id, {
        resolution: inspection.resolution,
        inspectionNotes: inspection.notes || undefined,
        refundAmount: inspection.resolution === 'refund' ? toMinorUnits(Number(inspection.refundAmount)) : undefined,
      })
      toast.success('Inspection recorded.')
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to record inspection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      {dialog}
      <header className="admin-page-header">
        <h1>Return {r.returnNumber}</h1>
        <StatusPill status={r.status} />
      </header>

      <div className="admin-grid-2">
        <AdminCard title="Details">
          <dl className="admin-dl">
            <dt>Reason</dt><dd>{r.reason ?? '—'}</dd>
            <dt>Customer notes</dt><dd>{r.customerNotes ?? '—'}</dd>
            <dt>Internal notes</dt><dd>{r.internalNotes ?? '—'}</dd>
            <dt>Resolution</dt><dd>{r.resolution ?? '—'}</dd>
            <dt>Refund amount</dt><dd>{r.refundAmount ? formatMoney(r.refundAmount) : '—'}</dd>
            <dt>Refund method</dt><dd>{r.refundMethod ?? '—'}</dd>
            <dt>ERP credit note</dt><dd>{r.ledgixCreditNoteNumber ?? '—'}</dd>
          </dl>
        </AdminCard>

        <AdminCard title="Items">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Qty</th><th>Reason</th><th>Refund</th></tr></thead>
              <tbody>
                {(r.items ?? []).map((it) => (
                  <tr key={it.id}><td>{it.quantity}</td><td>{it.reason ?? '—'}</td><td>{it.refundAmount ? formatMoney(it.refundAmount) : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </div>

      <AdminCard title="Timeline">
        <ul className="admin-timeline">
          {(r.events ?? []).map((ev) => (
            <li key={ev.id}><StatusPill status={ev.toStatus} /> {ev.note ?? ''} <time>{new Date(ev.createdAt).toLocaleString()}</time></li>
          ))}
        </ul>
      </AdminCard>

      <AdminCard title="Actions">
        <div className="form-field">
          <label className="form-label">Note (optional, for review/approve/reject/received/close)</label>
          <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="admin-action-row">
          {r.status === 'requested' && (
            <button disabled={busy} type="button" className="admin-btn admin-btn-ghost" onClick={() => run('review', 'Move under review', () => moveReturnUnderReview(id, note))}>
              Move under review
            </button>
          )}
          {(r.status === 'requested' || r.status === 'under_review') && (
            <>
              <button disabled={busy} type="button" className="admin-btn admin-btn-primary" onClick={() => run('approve', 'Approve return', () => approveReturn(id, note))}>
                Approve
              </button>
              <button disabled={busy} type="button" className="admin-btn admin-btn-danger" onClick={() => run('reject', 'Reject return', () => rejectReturn(id, note), true)}>
                Reject
              </button>
            </>
          )}
          {['approved', 'pickup_requested', 'in_transit'].includes(r.status) && (
            <button disabled={busy} type="button" className="admin-btn admin-btn-ghost" onClick={() => run('received', 'Mark received', () => markReturnReceived(id, note))}>
              Mark received
            </button>
          )}
          {['refunded', 'replaced', 'rejected'].includes(r.status) && (
            <button disabled={busy} type="button" className="admin-btn admin-btn-ghost" onClick={() => run('close', 'Close return', () => closeReturn(id, note))}>
              Close
            </button>
          )}
        </div>

        {r.status === 'received' && (
          <div className="admin-inspection-form">
            <h4 className="admin-form-subheading">Record inspection outcome</h4>
            <div className="admin-form-row">
              <select className="form-select" value={inspection.resolution} onChange={(e) => setInspection((s) => ({ ...s, resolution: e.target.value }))}>
                <option value="refund">Refund</option>
                <option value="replacement">Replacement</option>
              </select>
              {inspection.resolution === 'refund' && (
                <input className="form-input" type="number" min="0" step="0.01" placeholder="Refund amount" value={inspection.refundAmount} onChange={(e) => setInspection((s) => ({ ...s, refundAmount: e.target.value }))} />
              )}
              <input className="form-input" placeholder="Inspection notes" value={inspection.notes} onChange={(e) => setInspection((s) => ({ ...s, notes: e.target.value }))} />
              <button type="button" className="admin-btn admin-btn-primary" disabled={busy} onClick={handleInspection}>
                Record outcome
              </button>
            </div>
          </div>
        )}
      </AdminCard>
    </div>
  )
}
