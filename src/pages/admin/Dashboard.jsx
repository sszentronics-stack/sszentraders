import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCard, StatBox, LoadingState } from '../../components/admin/ui'
import { formatMoney } from '../../../backend/lib/money/index'
import { getTodayOrderStats, countPendingOrders } from '../../repositories/admin/orders.admin.repository'
import { countPaymentsNeedingAttention } from '../../repositories/admin/payments.admin.repository'
import { listShipmentsForReconciliation } from '../../repositories/admin/shipments.admin.repository'
import { listReturnsForAdmin } from '../../repositories/admin/returns.admin.repository'
import { listUnsyncedFinancialEvents, getErpHealth } from '../../repositories/admin/accounting.admin.repository'
import { listUnmappedVariants } from '../../repositories/admin/inventory.admin.repository'

/**
 * Ops home: queues + key commerce metrics. Every card loads independently
 * (Promise.allSettled) so one failing/unreachable dependency (e.g. no live
 * Supabase project in this environment) never blanks the whole page —
 * each card shows its own empty/error state instead.
 */
function useCard(loader) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  useEffect(() => {
    let cancelled = false
    loader()
      .then((data) => !cancelled && setState({ status: 'ok', data, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', data: null, error: err?.message ?? 'Failed to load.' }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return state
}

function Cell({ state, render }) {
  if (state.status === 'loading') return <LoadingState />
  if (state.status === 'error') return <p className="admin-error-inline">{state.error}</p>
  return render(state.data)
}

export default function Dashboard() {
  const today = useCard(getTodayOrderStats)
  const pendingOrders = useCard(countPendingOrders)
  const payments = useCard(countPaymentsNeedingAttention)
  const shipments = useCard(() => listShipmentsForReconciliation({ onlyBookingErrors: true, limit: 50 }))
  const returnsQueue = useCard(() => listReturnsForAdmin({ status: 'requested', limit: 50 }))
  const erpUnsynced = useCard(() => listUnsyncedFinancialEvents(200))
  const erpHealth = useCard(getErpHealth)
  const inventory = useCard(listUnmappedVariants)

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Dashboard</h1>
        <p>Today, at a glance.</p>
      </header>

      <div className="admin-stat-grid">
        <Cell state={today} render={(d) => <StatBox label="Orders today" value={d.count} />} />
        <Cell state={today} render={(d) => <StatBox label="Revenue today" value={formatMoney(d.revenue)} />} />
        <Cell state={pendingOrders} render={(d) => <StatBox label="Pending confirmation" value={d} tone={d > 0 ? 'warn' : 'default'} />} />
        <Cell
          state={erpHealth}
          render={(d) => <StatBox label="ERP" value={d.configured ? 'Connected' : 'Not configured'} tone={d.configured ? 'good' : 'warn'} hint={`${d.pendingSyncCount} pending sync`} />}
        />
      </div>

      <div className="admin-grid-2">
        <AdminCard title="Payments needing attention" action={<Link to="/admin/payments" className="admin-link">View all</Link>}>
          <Cell
            state={payments}
            render={(count) =>
              count > 0 ? <StatBox label="Pending / processing / failed" value={count} tone="warn" /> : <p className="admin-muted">Nothing needs attention.</p>
            }
          />
        </AdminCard>

        <AdminCard title="Shipments needing attention" action={<Link to="/admin/shipments" className="admin-link">View all</Link>}>
          <Cell
            state={shipments}
            render={(rows) =>
              rows.length > 0 ? <StatBox label="Booking errors" value={rows.length} tone="warn" /> : <p className="admin-muted">Nothing needs attention.</p>
            }
          />
        </AdminCard>

        <AdminCard title="Returns awaiting review" action={<Link to="/admin/returns" className="admin-link">View all</Link>}>
          <Cell
            state={returnsQueue}
            render={(rows) =>
              rows.length > 0 ? <StatBox label="Requested" value={rows.length} tone="warn" /> : <p className="admin-muted">Nothing pending.</p>
            }
          />
        </AdminCard>

        <AdminCard title="ERP sync failures" action={<Link to="/admin/erp" className="admin-link">View sync center</Link>}>
          <Cell
            state={erpUnsynced}
            render={(d) => {
              const failed = d.events.filter((e) => e.syncJob?.status === 'failed').length
              return failed > 0 ? <StatBox label="Failed events" value={failed} tone="bad" /> : <p className="admin-muted">No sync failures.</p>
            }}
          />
        </AdminCard>

        <AdminCard title="Stale / unmapped inventory" action={<Link to="/admin/inventory" className="admin-link">View inventory</Link>}>
          <Cell
            state={inventory}
            render={(d) =>
              d.variants.length > 0 ? <StatBox label="Unmapped variants" value={d.variants.length} tone="warn" /> : <p className="admin-muted">Everything is mapped.</p>
            }
          />
        </AdminCard>
      </div>
    </div>
  )
}
