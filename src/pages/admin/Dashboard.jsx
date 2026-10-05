import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCard, StatBox, LoadingState } from '../../components/admin/ui'
import { AreaTrendChart, DonutChart, HorizontalBars, VerticalBarChart, QUEUE_COLORS, DASHBOARD_COLORS } from '../../components/admin/AdminCharts'
import { formatMoney } from '../../../backend/lib/money/index'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import {
  mockDashboardLoaders,
} from '../../mocks/adminDashboard.mock'
import { getTodayOrderStats, countPendingOrders } from '../../repositories/admin/orders.admin.repository'
import { countPaymentsNeedingAttention } from '../../repositories/admin/payments.admin.repository'
import { listShipmentsForReconciliation } from '../../repositories/admin/shipments.admin.repository'
import { listReturnsForAdmin } from '../../repositories/admin/returns.admin.repository'
import { listUnsyncedFinancialEvents, getErpHealth } from '../../repositories/admin/accounting.admin.repository'
import { listUnmappedVariants } from '../../repositories/admin/inventory.admin.repository'

/**
 * Ops home: queues + key commerce metrics. Every card loads independently
 * so one failing dependency never blanks the whole page. When Supabase is
 * not configured, static mock loaders power a UI-only preview.
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

function isEdgeMissingError(err) {
  const msg = String(err?.message ?? err ?? '')
  return /not deployed|failed to send a request to the edge function|edge function/i.test(msg)
}

/** Prefer live data; if Edge Functions aren't deployed yet, use mocks so the UI stays usable. */
function withMockFallback(liveLoader, mockLoader) {
  return async () => {
    try {
      return await liveLoader()
    } catch (err) {
      if (isEdgeMissingError(err)) return mockLoader()
      throw err
    }
  }
}

function getLoaders() {
  const mocks = mockDashboardLoaders()
  if (!isSupabaseConfigured()) return mocks

  return {
    getTodayOrderStats: withMockFallback(getTodayOrderStats, mocks.getTodayOrderStats),
    countPendingOrders: withMockFallback(countPendingOrders, mocks.countPendingOrders),
    countPaymentsNeedingAttention: withMockFallback(
      countPaymentsNeedingAttention,
      mocks.countPaymentsNeedingAttention,
    ),
    listShipmentsForReconciliation: withMockFallback(
      () => listShipmentsForReconciliation({ onlyBookingErrors: true, limit: 50 }),
      mocks.listShipmentsForReconciliation,
    ),
    listReturnsForAdmin: withMockFallback(
      () => listReturnsForAdmin({ status: 'requested', limit: 50 }),
      mocks.listReturnsForAdmin,
    ),
    listUnsyncedFinancialEvents: withMockFallback(
      () => listUnsyncedFinancialEvents(200),
      mocks.listUnsyncedFinancialEvents,
    ),
    getErpHealth: withMockFallback(getErpHealth, mocks.getErpHealth),
    listUnmappedVariants: withMockFallback(listUnmappedVariants, mocks.listUnmappedVariants),
    getOrdersTrend: mocks.getOrdersTrend,
    getRevenueBars: mocks.getRevenueBars,
    getOrdersYearly: mocks.getOrdersYearly,
    getRevenueYearly: mocks.getRevenueYearly,
  }
}

export default function Dashboard() {
  const loaders = getLoaders()
  const today = useCard(loaders.getTodayOrderStats)
  const pendingOrders = useCard(loaders.countPendingOrders)
  const payments = useCard(loaders.countPaymentsNeedingAttention)
  const shipments = useCard(loaders.listShipmentsForReconciliation)
  const returnsQueue = useCard(loaders.listReturnsForAdmin)
  const erpUnsynced = useCard(loaders.listUnsyncedFinancialEvents)
  const erpHealth = useCard(loaders.getErpHealth)
  const inventory = useCard(loaders.listUnmappedVariants)
  const trend = useCard(loaders.getOrdersTrend)
  const revenueBars = useCard(loaders.getRevenueBars)
  const yearlyOrders = useCard(loaders.getOrdersYearly)
  const yearlyRevenue = useCard(loaders.getRevenueYearly)

  const queueReady =
    pendingOrders.status === 'ok' &&
    payments.status === 'ok' &&
    shipments.status === 'ok' &&
    returnsQueue.status === 'ok' &&
    erpUnsynced.status === 'ok'

  const queueCounts = useMemo(() => {
    if (!queueReady) return null
    const erpFailed = erpUnsynced.data.events.filter((e) => e.syncJob?.status === 'failed').length
    return {
      pending: pendingOrders.data,
      payments: payments.data,
      shipments: shipments.data.length,
      returnsCount: returnsQueue.data.length,
      erpFailed,
    }
  }, [queueReady, pendingOrders.data, payments.data, shipments.data, returnsQueue.data, erpUnsynced.data])

  const donutSegments = queueCounts
    ? [
        { label: 'Orders', value: queueCounts.pending, color: QUEUE_COLORS.orders },
        { label: 'Payments', value: queueCounts.payments, color: QUEUE_COLORS.payments },
        { label: 'Shipments', value: queueCounts.shipments, color: QUEUE_COLORS.shipments },
        { label: 'Returns', value: queueCounts.returnsCount, color: QUEUE_COLORS.returns },
        { label: 'ERP', value: queueCounts.erpFailed, color: QUEUE_COLORS.erp },
      ].filter((s) => s.value > 0)
    : []

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Today’s ops snapshot for SSzentronics.</p>
        </div>
      </header>

      <div className="admin-stat-grid">
        <Cell state={today} render={(d) => <StatBox label="Orders today" value={d.count} />} />
        <Cell state={today} render={(d) => <StatBox label="Revenue today" value={formatMoney(d.revenue)} />} />
        <Cell state={pendingOrders} render={(d) => <StatBox label="Pending confirmation" value={d} tone={d > 0 ? 'warn' : 'default'} />} />
        <Cell
          state={erpHealth}
          render={(d) => (
            <StatBox
              label="ERP"
              value={d.configured ? 'Connected' : 'Not configured'}
              tone={d.configured ? 'good' : 'warn'}
              hint={`${d.pendingSyncCount} pending sync`}
            />
          )}
        />
      </div>

      <div className="admin-charts-grid">
        <AdminCard title="Orders this week">
          <Cell state={trend} render={(points) => <AreaTrendChart points={points} color={DASHBOARD_COLORS.rose} />} />
        </AdminCard>
        <AdminCard title="Attention mix">
          {queueCounts ? (
            donutSegments.length ? (
              <DonutChart segments={donutSegments} />
            ) : (
              <p className="admin-muted">Nothing in the queues right now.</p>
            )
          ) : (
            <LoadingState />
          )}
        </AdminCard>
      </div>

      <AdminCard title="Orders this year">
        <Cell
          state={yearlyOrders}
          render={(points) => <AreaTrendChart points={points} height={210} color={DASHBOARD_COLORS.roseDeep} />}
        />
      </AdminCard>

      <div className="admin-charts-grid">
        <AdminCard title="Revenue this week">
          <Cell state={revenueBars} render={(rows) => <HorizontalBars rows={rows} />} />
        </AdminCard>
        <AdminCard title="Revenue this year">
          <Cell
            state={yearlyRevenue}
            render={(points) => <VerticalBarChart points={points} color={DASHBOARD_COLORS.rose} />}
          />
        </AdminCard>
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
