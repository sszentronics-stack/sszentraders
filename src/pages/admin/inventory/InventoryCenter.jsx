import { useEffect, useState } from 'react'
import { AdminCard, EmptyState, ErrorState, LoadingState } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import { listUnmappedVariants, syncInventoryFromErp, mapVariantToErpItem } from '../../../repositories/admin/inventory.admin.repository'

/**
 * No raw quantity editing here by design — Phase 9 established LedGix ERP
 * as the sole system of record for stock levels. Admin can request a sync
 * (pull the current ERP snapshot) or fix a variant<->ERP item mapping;
 * quantities themselves are never hand-entered.
 */
export default function InventoryCenter() {
  const [state, setState] = useState({ status: 'loading', variants: [] })
  const [syncing, setSyncing] = useState(false)
  const [mapping, setMapping] = useState({})
  const toast = useAdminToast()

  function reload() {
    setState({ status: 'loading', variants: [] })
    listUnmappedVariants()
      .then((d) => setState({ status: 'ok', variants: d.variants }))
      .catch((err) => setState({ status: 'error', variants: [], error: err?.message }))
  }

  useEffect(reload, [])

  async function handleSync() {
    setSyncing(true)
    try {
      const result = await syncInventoryFromErp()
      toast.success(`Sync complete: ${result.updated ?? 0} variants updated.`)
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleMap(variantId) {
    const ledgixItemId = mapping[variantId]
    if (!ledgixItemId?.trim()) {
      toast.error('Enter a LedGix item id first.')
      return
    }
    try {
      await mapVariantToErpItem(variantId, ledgixItemId.trim())
      toast.success('Mapped.')
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to map variant.')
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Inventory</h1>
        <button type="button" className="admin-btn admin-btn-primary" disabled={syncing} onClick={handleSync}>
          {syncing ? 'Syncing…' : 'Sync from ERP'}
        </button>
      </header>

      <AdminCard title="Unmapped variants">
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} onRetry={reload} />}
        {state.status === 'ok' && state.variants.length === 0 && <EmptyState>Every published variant is mapped to an ERP item.</EmptyState>}
        {state.status === 'ok' && state.variants.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>SKU</th><th>Product</th><th>LedGix item id</th><th></th></tr></thead>
              <tbody>
                {state.variants.map((v) => (
                  <tr key={v.variantId ?? v.id}>
                    <td>{v.sku}</td>
                    <td>{v.productName ?? '—'}</td>
                    <td>
                      <input
                        className="form-input"
                        placeholder="ledgix-item-id"
                        value={mapping[v.variantId ?? v.id] ?? ''}
                        onChange={(e) => setMapping((m) => ({ ...m, [v.variantId ?? v.id]: e.target.value }))}
                      />
                    </td>
                    <td>
                      <button type="button" className="admin-link-btn" onClick={() => handleMap(v.variantId ?? v.id)}>Map</button>
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
