/**
 * Small shared building blocks for admin pages — cards, badges, empty/error
 * states, pagination, and a confirm dialog for destructive/financial
 * actions. Kept in one file since each piece is small and they're always
 * used together; split out if any grows past a screen.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

/**
 * Back-link above a detail page's title, e.g. `<AdminBreadcrumb to="/admin/products" label="Products" />`
 * renders "← Products" so a nested detail view (product, order, customer,
 * return) never strands the admin with no way back except the sidebar.
 */
export function AdminBreadcrumb({ to, label }) {
  return (
    <nav className="admin-breadcrumb" aria-label="Breadcrumb">
      <Link to={to} className="admin-breadcrumb-back">
        <ChevronLeft size={16} />
        {label}
      </Link>
    </nav>
  )
}

export function AdminCard({ title, action, children, className = '' }) {
  return (
    <section className={`admin-card ${className}`}>
      {(title || action) && (
        <header className="admin-card-header">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      <div className="admin-card-body">{children}</div>
    </section>
  )
}

export function StatBox({ label, value, hint, tone = 'default' }) {
  return (
    <div className={`admin-stat admin-stat-${tone}`}>
      <span className="admin-stat-value">{value}</span>
      <span className="admin-stat-label">{label}</span>
      {hint && <span className="admin-stat-hint">{hint}</span>}
    </div>
  )
}

const STATUS_TONE = {
  published: 'good', active: 'good', paid: 'good', delivered: 'good', succeeded: 'good', approved: 'good', configured: 'good', refunded: 'good',
  draft: 'neutral', pending: 'warn', processing: 'warn', under_review: 'warn', pickup_requested: 'warn', in_transit: 'warn', requested: 'warn', in_progress: 'warn', partially_refunded: 'warn',
  failed: 'bad', cancelled: 'bad', rejected: 'bad', archived: 'bad', not_configured: 'bad', returned: 'bad', blocked: 'bad',
}

export function StatusPill({ status }) {
  if (!status) return null
  const tone = STATUS_TONE[status] ?? 'neutral'
  return <span className={`admin-pill admin-pill-${tone}`}>{String(status).replace(/_/g, ' ')}</span>
}

export function EmptyState({ children }) {
  return <div className="admin-empty">{children}</div>
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="admin-error">
      <p>{message ?? 'Something went wrong loading this data.'}</p>
      {onRetry && (
        <button type="button" className="admin-btn admin-btn-ghost" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="admin-loading">
      <span className="spinner" style={{ borderTopColor: '#c98a7d', borderColor: 'rgba(201,138,125,0.25)' }} />
      <span>{label}</span>
    </div>
  )
}

export function Pagination({ offset, limit, total, onChange }) {
  if (total === null || total === undefined) return null
  const hasPrev = offset > 0
  const hasNext = offset + limit < total
  if (!hasPrev && !hasNext) return null
  return (
    <div className="admin-pagination">
      <button type="button" className="admin-btn admin-btn-ghost" disabled={!hasPrev} onClick={() => onChange(Math.max(0, offset - limit))}>
        Previous
      </button>
      <span>
        {Math.min(offset + 1, total)}–{Math.min(offset + limit, total)} of {total}
      </span>
      <button type="button" className="admin-btn admin-btn-ghost" disabled={!hasNext} onClick={() => onChange(offset + limit)}>
        Next
      </button>
    </div>
  )
}

/**
 * Confirmation gate for destructive/financial actions (spec requirement).
 * `useConfirm()` returns a `confirm(opts)` function resolving to a boolean,
 * plus the dialog element to render once near the page root.
 */
export function useConfirm() {
  const [state, setState] = useState(null) // { title, body, confirmLabel, resolve }

  const confirm = (opts) =>
    new Promise((resolve) => {
      setState({ ...opts, resolve })
    })

  const dialog = state ? (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true">
      <div className="admin-modal">
        <h3>{state.title ?? 'Are you sure?'}</h3>
        {state.body && <p>{state.body}</p>}
        <div className="admin-modal-actions">
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            onClick={() => {
              state.resolve(false)
              setState(null)
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`admin-btn ${state.danger ? 'admin-btn-danger' : 'admin-btn-primary'}`}
            onClick={() => {
              state.resolve(true)
              setState(null)
            }}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, dialog }
}
