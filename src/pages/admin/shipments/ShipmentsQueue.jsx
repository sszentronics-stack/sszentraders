import { useEffect, useState } from 'react'
import { AdminCard, EmptyState, ErrorState, LoadingState, StatusPill, useConfirm } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import { listShipmentsForReconciliation, retryShipmentBooking, refreshShipmentTracking } from '../../../repositories/admin/shipments.admin.repository'

export default function ShipmentsQueue() {
  const [onlyIssues, setOnlyIssues] = useState(true)
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [busyId, setBusyId] = useState(null)
  const toast = useAdminToast()
  const { confirm, dialog } = useConfirm()

  function reload() {
    setState({ status: 'loading', items: [] })
    listShipmentsForReconciliation({ onlyBookingErrors: onlyIssues, limit: 100 })
      .then((items) => setState({ status: 'ok', items }))
      .catch((err) => setState({ status: 'error', items: [], error: err?.message }))
  }

  useEffect(reload, [onlyIssues]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRetry(shipmentId) {
    const ok = await confirm({ title: 'Retry booking this shipment?', confirmLabel: 'Retry booking' })
    if (!ok) return
    setBusyId(shipmentId)
    try {
      await retryShipmentBooking(shipmentId)
      toast.success('Booking retried.')
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Retry failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRefresh(shipmentId) {
    setBusyId(shipmentId)
    try {
      await refreshShipmentTracking(shipmentId)
      toast.success('Tracking refreshed.')
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Refresh failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page">
      {dialog}
      <header className="admin-page-header">
        <h1>Shipments</h1>
        <label className="form-checkbox-row" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          Only show booking errors
        </label>
      </header>

      <AdminCard>
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} onRetry={reload} />}
        {state.status === 'ok' && state.items.length === 0 && <EmptyState>Nothing needs attention.</EmptyState>}
        {state.status === 'ok' && state.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Purpose</th><th>Tracking #</th><th>Status</th><th>Booking error</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {state.items.map((s) => (
                  <tr key={s.shipmentId}>
                    <td>{s.purpose}</td>
                    <td>{s.trackingNumber ?? '—'}</td>
                    <td><StatusPill status={s.status} /></td>
                    <td className="admin-error-inline">{s.bookingError ?? ''}</td>
                    <td>{new Date(s.updatedAt).toLocaleString()}</td>
                    <td className="admin-table-actions">
                      <button type="button" className="admin-link-btn" disabled={busyId === s.shipmentId} onClick={() => handleRetry(s.shipmentId)}>Retry booking</button>
                      <button type="button" className="admin-link-btn" disabled={busyId === s.shipmentId} onClick={() => handleRefresh(s.shipmentId)}>Refresh tracking</button>
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
