import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatMoney } from '../../../backend/lib/money/index'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import {
  RETURN_REASON_LABELS,
  REASON_CODES_REQUIRING_EVIDENCE,
  createReturnRequest,
  listReturnableItemsForOrder,
  uploadReturnEvidence,
} from '../../repositories/returns.repository'

const REASON_OPTIONS = Object.entries(RETURN_REASON_LABELS)

export default function RequestReturn() {
  const { id: orderId } = useParams()
  const navigate = useNavigate()

  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selections, setSelections] = useState({}) // orderItemId -> { quantity, reasonCode, notes, files }
  const [customerNotes, setCustomerNotes] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoadError('Returns are not available right now.')
      return
    }
    listReturnableItemsForOrder(orderId)
      .then(setItems)
      .catch((err) => setLoadError(err?.message ?? 'Could not load this order for return.'))
  }, [orderId])

  const setSelection = (orderItemId, patch) => {
    setSelections((prev) => ({
      ...prev,
      [orderItemId]: { quantity: 0, reasonCode: 'changed_mind', notes: '', files: [], ...prev[orderItemId], ...patch },
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const lines = Object.entries(selections).filter(([, sel]) => sel.quantity > 0)
    if (lines.length === 0) {
      setError('Select at least one item and quantity to return.')
      return
    }

    setSubmitting(true)
    try {
      const returnItems = []
      for (const [orderItemId, sel] of lines) {
        let evidenceStoragePaths = []
        if (sel.files.length > 0) {
          evidenceStoragePaths = await Promise.all(sel.files.map((file) => uploadReturnEvidence(orderItemId, file)))
        }
        returnItems.push({
          orderItemId,
          quantity: sel.quantity,
          reasonCode: sel.reasonCode,
          notes: sel.notes || undefined,
          evidenceStoragePaths,
        })
      }

      const created = await createReturnRequest({ orderId, customerNotes: customerNotes || undefined, items: returnItems })
      navigate(`/account/returns/${created.id}`)
    } catch (err) {
      setError(err?.message ?? 'Could not submit this return request.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <div className="container-aura py-16 text-center">
        <p className="mb-4">{loadError}</p>
        <Link to="/account/orders" className="btn-outline inline-block w-auto px-8">Back to orders</Link>
      </div>
    )
  }

  if (!items) {
    return (
      <div className="container-aura py-16 text-center">
        <p className="text-ink-soft">Loading...</p>
      </div>
    )
  }

  const eligibleItems = items.filter((item) => item.remainingEligibleQuantity > 0)

  return (
    <div className="container-aura py-10 md:py-14 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-medium mb-2">Request a return</h1>
      <p className="text-ink-soft mb-8">Select the item(s) you'd like to return and tell us why.</p>

      {eligibleItems.length === 0 && (
        <div className="form-banner form-banner-error mb-6">
          No items on this order are currently eligible for a return (either the return window has closed or every unit has already been requested).
        </div>
      )}

      {error && <div className="form-banner form-banner-error mb-6">{error}</div>}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {eligibleItems.map((item) => {
          const sel = selections[item.orderItemId] ?? { quantity: 0, reasonCode: 'changed_mind', notes: '', files: [] }
          const needsEvidence = REASON_CODES_REQUIRING_EVIDENCE.has(sel.reasonCode)
          return (
            <div key={item.orderItemId} className="address-card">
              <p className="font-medium mb-1">
                {item.productName}
                {item.variantName ? ` — ${item.variantName}` : ''}
              </p>
              <p className="text-sm text-ink-soft mb-3">
                {formatMoney(item.unitPrice)} each · up to {item.remainingEligibleQuantity} of {item.purchasedQuantity} eligible
              </p>

              <div className="form-field">
                <label className="form-label">Quantity to return</label>
                <select
                  className="form-input"
                  value={sel.quantity}
                  onChange={(e) => setSelection(item.orderItemId, { quantity: Number(e.target.value) })}
                >
                  <option value={0}>Not returning this item</option>
                  {Array.from({ length: item.remainingEligibleQuantity }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {sel.quantity > 0 && (
                <>
                  <div className="form-field">
                    <label className="form-label">Reason</label>
                    <select
                      className="form-input"
                      value={sel.reasonCode}
                      onChange={(e) => setSelection(item.orderItemId, { reasonCode: e.target.value })}
                    >
                      {REASON_OPTIONS.map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Notes (optional)</label>
                    <textarea
                      className="form-input"
                      rows={3}
                      maxLength={1000}
                      value={sel.notes}
                      onChange={(e) => setSelection(item.orderItemId, { notes: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">
                      Photo evidence {needsEvidence ? '(required for this reason)' : '(optional)'}
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      multiple
                      onChange={(e) => setSelection(item.orderItemId, { files: Array.from(e.target.files ?? []) })}
                    />
                  </div>
                </>
              )}
            </div>
          )
        })}

        {eligibleItems.length > 0 && (
          <div className="form-field">
            <label className="form-label">Anything else we should know? (optional)</label>
            <textarea className="form-input" rows={3} maxLength={2000} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="btn-lavender" style={{ width: 'auto' }} disabled={submitting || eligibleItems.length === 0}>
            {submitting ? <span className="spinner" /> : 'Submit return request'}
          </button>
          <Link to={`/account/orders/${orderId}`} className="btn-outline inline-block w-auto px-6 text-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
