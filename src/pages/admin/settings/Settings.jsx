import { useEffect, useState } from 'react'
import { AdminCard, ErrorState, LoadingState, StatusPill } from '../../../components/admin/ui'
import { getIntegrationsStatus } from '../../../repositories/admin/accounting.admin.repository'

/**
 * Read-only integration status — booleans only, never secret values (see
 * supabase/functions/accounting/index.ts's GET /integrations/status and
 * ../_shared/config.ts, which is the only place that reads the actual
 * env vars). Nothing here is editable; secrets are set via
 * `supabase secrets set` outside this app.
 */
const INTEGRATIONS = [
  { key: 'ledgix', label: 'LedGix ERP', description: 'Invoicing, credit notes, inventory snapshot, customer sync.' },
  { key: 'easypaisa', label: 'Easypaisa', description: 'Online payments, refunds, reconciliation.' },
  { key: 'leopards', label: 'Leopards Courier', description: 'Shipment booking, pickup, tracking.' },
]

export default function Settings() {
  const [state, setState] = useState({ status: 'loading', data: null })

  function reload() {
    setState({ status: 'loading', data: null })
    getIntegrationsStatus()
      .then((data) => setState({ status: 'ok', data }))
      .catch((err) => setState({ status: 'error', data: null, error: err?.message }))
  }

  useEffect(reload, [])

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Settings</h1>
      </header>

      <AdminCard title="Integrations">
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} onRetry={reload} />}
        {state.status === 'ok' && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Integration</th><th>Status</th><th>What it covers</th></tr></thead>
              <tbody>
                {INTEGRATIONS.map((i) => {
                  const configured = state.data[i.key]?.configured
                  return (
                    <tr key={i.key}>
                      <td>{i.label}</td>
                      <td><StatusPill status={configured ? 'configured' : 'not_configured'} /></td>
                      <td>{i.description}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="admin-muted admin-form-hint">Secrets are managed outside this app (`supabase secrets set`) — this page never displays or accepts credential values.</p>
      </AdminCard>
    </div>
  )
}
