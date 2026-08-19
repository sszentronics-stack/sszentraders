import { useEffect, useState } from 'react'
import { AdminCard, EmptyState, ErrorState, LoadingState, StatBox, StatusPill } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import { listUnsyncedFinancialEvents, retryFinancialEventSync, syncFinancialEventNow, getErpHealth, runErpReconciliation } from '../../../repositories/admin/accounting.admin.repository'
import { formatMoney } from '../../../../backend/lib/money/index'

export default function ErpSyncCenter() {
  const [health, setHealth] = useState({ status: 'loading' })
  const [unsynced, setUnsynced] = useState({ status: 'loading' })
  const [reconciliation, setReconciliation] = useState({ status: 'loading' })
  const [busyId, setBusyId] = useState(null)
  const toast = useAdminToast()

  function reload() {
    setHealth({ status: 'loading' })
    getErpHealth().then((d) => setHealth({ status: 'ok', data: d })).catch((err) => setHealth({ status: 'error', error: err?.message }))
    setUnsynced({ status: 'loading' })
    listUnsyncedFinancialEvents(200).then((d) => setUnsynced({ status: 'ok', data: d.events })).catch((err) => setUnsynced({ status: 'error', error: err?.message }))
    setReconciliation({ status: 'loading' })
    runErpReconciliation().then((d) => setReconciliation({ status: 'ok', data: d.issues })).catch((err) => setReconciliation({ status: 'error', error: err?.message }))
  }

  useEffect(reload, [])

  async function handleRetry(id) {
    setBusyId(id)
    try {
      await retryFinancialEventSync(id)
      toast.success('Sync requeued.')
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Retry failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSyncNow(id) {
    setBusyId(id)
    try {
      const result = await syncFinancialEventNow(id)
      toast.info(result?.status === 'succeeded' ? 'Synced.' : (result?.error ?? 'Sync attempted — see status.'))
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Sync failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>ERP Sync Center</h1>
      </header>

      <div className="admin-stat-grid">
        {health.status === 'ok' && (
          <>
            <StatBox label="LedGix" value={health.data.configured ? 'Connected' : 'Not configured'} tone={health.data.configured ? 'good' : 'warn'} />
            <StatBox label="Pending sync jobs" value={health.data.pendingSyncCount} />
          </>
        )}
        {health.status === 'loading' && <LoadingState />}
        {health.status === 'error' && <ErrorState message={health.error} />}
      </div>

      <AdminCard title="Unsynced financial events">
        {unsynced.status === 'loading' && <LoadingState />}
        {unsynced.status === 'error' && <ErrorState message={unsynced.error} onRetry={reload} />}
        {unsynced.status === 'ok' && unsynced.data.length === 0 && <EmptyState>Everything is synced.</EmptyState>}
        {unsynced.status === 'ok' && unsynced.data.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Type</th><th>Amount</th><th>Sync status</th><th>Last error</th><th></th></tr></thead>
              <tbody>
                {unsynced.data.map((e) => (
                  <tr key={e.transaction.id}>
                    <td>{e.transaction.transactionType}</td>
                    <td>{formatMoney(e.transaction.amount, { currency: e.transaction.currency })}</td>
                    <td><StatusPill status={e.syncJob?.status ?? 'pending'} /></td>
                    <td className="admin-error-inline">{e.syncJob?.lastError ?? ''}</td>
                    <td className="admin-table-actions">
                      <button type="button" className="admin-link-btn" disabled={busyId === e.transaction.id} onClick={() => handleRetry(e.transaction.id)}>Requeue</button>
                      <button type="button" className="admin-link-btn" disabled={busyId === e.transaction.id} onClick={() => handleSyncNow(e.transaction.id)}>Sync now</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard title="Reconciliation issues">
        {reconciliation.status === 'loading' && <LoadingState />}
        {reconciliation.status === 'error' && <ErrorState message={reconciliation.error} onRetry={reload} />}
        {reconciliation.status === 'ok' && reconciliation.data.length === 0 && <EmptyState>No discrepancies found.</EmptyState>}
        {reconciliation.status === 'ok' && reconciliation.data.length > 0 && (
          <ul className="admin-timeline">
            {reconciliation.data.map((issue, i) => (
              <li key={i}><StatusPill status={issue.type ?? 'issue'} /> {issue.message ?? JSON.stringify(issue)}</li>
            ))}
          </ul>
        )}
      </AdminCard>
    </div>
  )
}
