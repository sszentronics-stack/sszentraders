import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCard, EmptyState, ErrorState, LoadingState, StatBox } from '../../../components/admin/ui'
import { formatMoney } from '../../../../backend/lib/money/index'
import {
  getBrandPerformance,
  getCategoryPerformance,
  getCommerceOverview,
  getCustomerCohortSummary,
  getDateRangeForPreset,
  customDateRange,
  getProductPerformance,
} from '../../../repositories/admin/analytics.admin.repository'
import { getErpHealth, runErpReconciliation } from '../../../repositories/admin/accounting.admin.repository'

/**
 * Reports & Commerce Analytics — Phase 15.
 *
 * Two clearly separated data sources, per the phase spec:
 *  1. "Commerce analytics" — real, live-computed numbers from Aura's own
 *     order/cart/return/product data. Operational, not accounting.
 *  2. "ERP financial reports" — would come from LedGix (revenue,
 *     receivables, receipts, refunds, inventory valuation, gross profit).
 *     No real LedGix reporting API exists yet (see
 *     backend/lib/providers/LedGixErpProvider.ts), so this section always
 *     renders an honest "unavailable" state driven by Phase 8's
 *     getErpHealthStatus — it never computes or guesses a number locally.
 *
 * Every metric's exact formula is documented in
 * backend/lib/analytics/index.ts and restated in
 * docs/phase-15-completion-report.md.
 */

function useAsync(loader, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })
    loader()
      .then((data) => !cancelled && setState({ status: 'ok', data, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', data: null, error: err?.message ?? 'Failed to load.' }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

function pct(ratio) {
  if (ratio === null || ratio === undefined) return '—'
  return `${(ratio * 100).toFixed(1)}%`
}

function DateRangeFilter({ range, onPreset, onCustom }) {
  const [fromInput, setFromInput] = useState(range.from.slice(0, 10))
  const [toInput, setToInput] = useState(range.to.slice(0, 10))

  return (
    <div className="admin-date-filter">
      <div className="admin-date-filter-presets">
        {['7d', '30d', '90d'].map((p) => (
          <button key={p} type="button" className={range.preset === p ? 'active' : ''} onClick={() => onPreset(p)}>
            Last {p.replace('d', '')} days
          </button>
        ))}
      </div>
      <span className="admin-muted">or</span>
      <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
      <span className="admin-muted">to</span>
      <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} />
      <button type="button" className="admin-btn admin-btn-ghost" onClick={() => onCustom(fromInput, toInput)}>
        Apply
      </button>
    </div>
  )
}

function CommerceOverviewSection({ range }) {
  const overview = useAsync(() => getCommerceOverview(range), [range.from, range.to])

  return (
    <AdminCard>
      <span className="admin-source-badge admin-source-badge-commerce">Commerce analytics</span>
      <p className="admin-muted" style={{ marginBottom: 12 }}>
        Computed live from Aura&rsquo;s own orders, carts, and returns for the selected range — currency PKR, timestamps stored in UTC
        and shown here in your local time. This is operational reporting, not ERP-authoritative accounting.
      </p>
      {overview.status === 'loading' && <LoadingState />}
      {overview.status === 'error' && <ErrorState message={overview.error} />}
      {overview.status === 'ok' && (
        <>
          <div className="admin-stat-grid">
            <StatBox label="Orders in range" value={overview.data.orderCount} hint="order_status != cancelled" />
            <StatBox label="Revenue" value={formatMoney(overview.data.revenue, { currency: 'PKR' })} hint="sum(grand_total)" />
            <StatBox
              label="Average order value"
              value={overview.data.averageOrderValue === null ? '—' : formatMoney(overview.data.averageOrderValue, { currency: 'PKR' })}
              hint="revenue / orders"
            />
            <StatBox label="Return rate" value={pct(overview.data.returnRate)} hint={`${overview.data.returnCount} return(s) created in range`} />
            <StatBox
              label="Returning-customer rate"
              value={pct(overview.data.returningCustomerRate)}
              hint={`${overview.data.returningCustomerCount} of ${overview.data.distinctOrderingCustomerCount} customers`}
              tone={overview.data.returningCustomerRate !== null && overview.data.returningCustomerRate > 0.3 ? 'good' : 'default'}
            />
            <StatBox
              label="Order-conversion proxy"
              value={pct(overview.data.orderConversionProxy)}
              hint={`${overview.data.orderCount} orders / ${overview.data.cartCount} carts started`}
            />
            <StatBox
              label="Abandoned carts"
              value={overview.data.abandonedCartCount}
              hint="live snapshot: active, inactive ≥3 days — not range-scoped"
              tone={overview.data.abandonedCartCount > 0 ? 'warn' : 'default'}
            />
            <StatBox label="Abandoned-cart rate (proxy)" value={pct(overview.data.abandonedCartRate)} hint="abandoned / (abandoned + orders in range)" />
          </div>
          {overview.data.truncated && <p className="admin-metric-note">This range has 2,000+ orders — counts reflect the most recent 2,000 only.</p>}
        </>
      )}
    </AdminCard>
  )
}

function PerformanceTable({ title, state, columns, emptyLabel }) {
  return (
    <AdminCard title={title}>
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.error} />}
      {state.status === 'ok' && state.data.length === 0 && <EmptyState>{emptyLabel}</EmptyState>}
      {state.status === 'ok' && state.data.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.data.map((row, i) => (
                <tr key={row.id ?? row.productId ?? i}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  )
}

function ProductPerformanceSection({ range }) {
  const perf = useAsync(() => getProductPerformance(range, 10), [range.from, range.to])
  const bestSellers = { status: perf.status, error: perf.error, data: perf.data?.bestSellers ?? [] }
  const slowMovers = { status: perf.status, error: perf.error, data: perf.data?.slowMovers ?? [] }

  const columns = [
    { key: 'name', label: 'Product' },
    { key: 'quantitySold', label: 'Units sold (range)' },
    { key: 'revenue', label: 'Revenue', render: (r) => formatMoney(r.revenue, { currency: 'PKR' }) },
    { key: 'quantityAvailable', label: 'Stock available', render: (r) => (r.quantityAvailable === null ? 'not synced' : r.quantityAvailable) },
  ]

  return (
    <div className="admin-grid-2">
      <PerformanceTable title="Best sellers (units sold, in range)" state={bestSellers} columns={columns} emptyLabel="No sales in this range." />
      <PerformanceTable title="Slow movers (published, lowest units sold)" state={slowMovers} columns={columns} emptyLabel="No published products." />
    </div>
  )
}

function BrandCategorySection({ range }) {
  const brands = useAsync(() => getBrandPerformance(range, 10), [range.from, range.to])
  const categories = useAsync(() => getCategoryPerformance(range, 10), [range.from, range.to])
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'quantitySold', label: 'Units sold' },
    { key: 'revenue', label: 'Revenue', render: (r) => formatMoney(r.revenue, { currency: 'PKR' }) },
  ]
  return (
    <div className="admin-grid-2">
      <PerformanceTable title="Brand performance" state={brands} columns={columns} emptyLabel="No sales to attribute to a brand in this range." />
      <PerformanceTable title="Category performance" state={categories} columns={columns} emptyLabel="No sales to attribute to a category in this range." />
    </div>
  )
}

function CohortSection({ range }) {
  const cohort = useAsync(() => getCustomerCohortSummary(range), [range.from, range.to])
  return (
    <AdminCard title="Customer cohort & CLV foundation">
      <span className="admin-source-badge admin-source-badge-commerce">Commerce analytics</span>
      <p className="admin-muted" style={{ marginBottom: 12 }}>
        A foundation, not a full retention/LTV model. CLV proxy = sum of a customer&rsquo;s non-cancelled order totals to date — it
        ignores cost of goods, acquisition cost, and future orders. For full customer-level segmentation (VIP / inactive / new), see{' '}
        <Link to="/admin/customers" className="admin-link">
          Customers
        </Link>
        .
      </p>
      {cohort.status === 'loading' && <LoadingState />}
      {cohort.status === 'error' && <ErrorState message={cohort.error} />}
      {cohort.status === 'ok' && (
        <div className="admin-stat-grid">
          <StatBox label="New customers" value={cohort.data.newCustomersInRange} hint="customers.created_at in range" />
          <StatBox
            label="Average CLV proxy"
            value={cohort.data.averageClvProxy === null ? '—' : formatMoney(cohort.data.averageClvProxy, { currency: 'PKR' })}
            hint={`sampled from ${cohort.data.customersSampled} customer(s) who ordered in range`}
          />
        </div>
      )}
    </AdminCard>
  )
}

const ERP_REPORT_CARDS = [
  { key: 'revenue', label: 'Revenue report' },
  { key: 'receivables', label: 'Receivables' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'inventory_valuation', label: 'Inventory valuation' },
  { key: 'gross_profit', label: 'Gross profit' },
]

function ErpFinancialReportsSection() {
  const health = useAsync(() => getErpHealth(), [])
  const reconciliation = useAsync(() => runErpReconciliation(), [])

  return (
    <>
      <AdminCard title="ERP financial reports">
        <span className="admin-source-badge admin-source-badge-erp">ERP accounting (LedGix) — authoritative when connected</span>
        <p className="admin-muted" style={{ marginBottom: 12 }}>
          These reports would come directly from LedGix ERP once connected. Aura does not, and will not, compute a competing
          profit-and-loss, balance sheet, or trial balance from local order data — that would risk silently disagreeing with the
          books. Until LedGix is configured, every report below is honestly unavailable rather than estimated.
        </p>
        {health.status === 'loading' && <LoadingState />}
        {health.status === 'error' && <ErrorState message={health.error} />}
        {health.status === 'ok' && (
          <>
            <div className="admin-stat-grid" style={{ marginBottom: 16 }}>
              <StatBox label="LedGix connection" value={health.data.configured ? 'Connected' : 'Not configured'} tone={health.data.configured ? 'good' : 'warn'} />
              <StatBox label="Pending sync jobs" value={health.data.pendingSyncCount} />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Source</th>
                    <th>Freshness</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ERP_REPORT_CARDS.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td>LedGix ERP</td>
                      <td>{health.data.configured ? 'as of last sync' : 'n/a'}</td>
                      <td>
                        {health.data.configured ? (
                          <span className="admin-pill admin-pill-warn">no reporting endpoint yet</span>
                        ) : (
                          <span className="admin-pill admin-pill-bad">ERP not configured</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-metric-note">
              ERP not configured — financial reports unavailable until the LedGix integration is live. No report figure above is a
              local estimate.
            </p>
          </>
        )}
      </AdminCard>

      <AdminCard title="Reconciliation" action={<Link to="/admin/erp" className="admin-link">Open ERP Sync Center</Link>}>
        <p className="admin-muted" style={{ marginBottom: 12 }}>
          Compares local financial-event records against what LedGix reports. With no live ERP connection there is nothing to compare
          against, so this honestly shows 0 comparable ERP records rather than a fabricated match — it does not mean local records are
          verified.
        </p>
        {reconciliation.status === 'loading' && <LoadingState />}
        {reconciliation.status === 'error' && <ErrorState message={reconciliation.error} />}
        {reconciliation.status === 'ok' && (
          <div className="admin-stat-grid">
            <StatBox label="Reconciliation issues found" value={reconciliation.data.issues.length} tone={reconciliation.data.issues.length > 0 ? 'warn' : 'default'} />
            <StatBox label="Comparable ERP records" value={0} hint="no live LedGix snapshot exists yet" />
          </div>
        )}
      </AdminCard>
    </>
  )
}

export default function Reports() {
  const [range, setRange] = useState(() => getDateRangeForPreset('30d'))

  const setPreset = (preset) => setRange(getDateRangeForPreset(preset))
  const setCustom = (from, to) => {
    if (!from || !to) return
    setRange(customDateRange(from, to))
  }

  const rangeLabel = useMemo(() => {
    const from = new Date(range.from).toLocaleDateString()
    const to = new Date(range.to).toLocaleDateString()
    return `${from} – ${to}`
  }, [range])

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Reports</h1>
        <p>Commerce analytics from Aura&rsquo;s own data, plus ERP-authoritative financial reports from LedGix (when connected).</p>
      </header>

      <div className="admin-section-intro">
        <p className="admin-muted">Range: {rangeLabel} (local time, UTC-stored)</p>
        <DateRangeFilter range={range} onPreset={setPreset} onCustom={setCustom} />
      </div>

      <CommerceOverviewSection range={range} />
      <ProductPerformanceSection range={range} />
      <BrandCategorySection range={range} />
      <CohortSection range={range} />
      <ErpFinancialReportsSection />
    </div>
  )
}
