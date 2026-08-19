import { useEffect, useState } from 'react'
import * as promotionsApi from '../../../repositories/promotions.repository'
import { formatMoney, toMinorUnits } from '../../../../backend/lib/money/index'

const EMPTY = {
  name: '',
  discountType: 'percentage',
  discountValue: 10,
  status: 'draft',
  minSpend: '',
  firstOrderOnly: false,
  appliesTo: 'all',
}

export default function Promotions() {
  const [promotions, setPromotions] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    promotionsApi.listPromotions().then(setPromotions).catch((err) => setError(err?.message ?? 'Failed to load promotions.'))
  }

  useEffect(load, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await promotionsApi.createPromotion({
        name: form.name,
        discountType: form.discountType,
        discountValue: form.discountType === 'fixed_amount' ? toMinorUnits(Number(form.discountValue)) : Number(form.discountValue),
        status: form.status,
        minSpend: form.minSpend ? toMinorUnits(Number(form.minSpend)) : undefined,
        firstOrderOnly: form.firstOrderOnly,
        appliesTo: form.appliesTo,
      })
      setForm(EMPTY)
      load()
    } catch (err) {
      setError(err?.message ?? 'Failed to create promotion.')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(promotion) {
    const nextStatus = promotion.status === 'active' ? 'paused' : 'active'
    try {
      await promotionsApi.updatePromotion(promotion.id, { status: nextStatus })
      load()
    } catch (err) {
      setError(err?.message ?? 'Failed to update promotion.')
    }
  }

  function describeValue(p) {
    if (p.discount_type === 'percentage') return `${p.discount_value}%`
    if (p.discount_type === 'fixed_amount') return formatMoney(p.discount_value)
    return 'Free shipping'
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-10">
      <div>
        <h2 className="text-xl font-medium mb-4">Promotions</h2>
        {error && <div className="form-banner form-banner-error mb-4">{error}</div>}
        {promotions === null ? (
          <p className="text-ink-soft">Loading...</p>
        ) : promotions.length === 0 ? (
          <p className="text-ink-soft text-sm">No promotions yet. Automatic promotions (no coupon attached) apply themselves at checkout; attach a coupon on the Coupons tab to make one code-based instead.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line">
                <th className="py-2">Name</th>
                <th>Discount</th>
                <th>Scope</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => (
                <tr key={p.id} className="border-b border-[#eee]">
                  <td className="py-2">{p.name}{p.first_order_only ? ' (first order)' : ''}</td>
                  <td>{describeValue(p)}</td>
                  <td>{p.applies_to}</td>
                  <td>{p.status}</td>
                  <td>
                    <button type="button" className="text-xs underline" onClick={() => toggleStatus(p)}>
                      {p.status === 'active' ? 'Pause' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form onSubmit={handleCreate} className="bg-meta p-6 h-fit">
        <h3 className="font-medium mb-4">New promotion</h3>
        <div className="form-field">
          <label className="form-label" htmlFor="p-name">Name</label>
          <input id="p-name" className="form-input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="p-type">Discount type</label>
          <select id="p-type" className="form-input" value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}>
            <option value="percentage">Percentage</option>
            <option value="fixed_amount">Fixed amount (Rs.)</option>
            <option value="free_shipping">Free shipping</option>
          </select>
        </div>
        {form.discountType !== 'free_shipping' && (
          <div className="form-field">
            <label className="form-label" htmlFor="p-value">{form.discountType === 'percentage' ? 'Percentage (0-100)' : 'Amount (Rs.)'}</label>
            <input id="p-value" type="number" min="0" className="form-input" value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))} />
          </div>
        )}
        <div className="form-field">
          <label className="form-label" htmlFor="p-min">Minimum spend (Rs., optional)</label>
          <input id="p-min" type="number" min="0" className="form-input" value={form.minSpend} onChange={(e) => setForm((f) => ({ ...f, minSpend: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="p-scope">Applies to</label>
          <select id="p-scope" className="form-input" value={form.appliesTo} onChange={(e) => setForm((f) => ({ ...f, appliesTo: e.target.value }))}>
            <option value="all">Whole cart</option>
          </select>
          <p className="text-xs text-ink-soft mt-1">Category/collection/product-scoped promotions can be set via the API; this form covers whole-cart offers, the common case.</p>
        </div>
        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm((f) => ({ ...f, firstOrderOnly: e.target.checked }))} />
          First order only
        </label>
        <button type="submit" className="btn-lavender w-auto px-6" disabled={submitting}>
          {submitting ? 'Saving...' : 'Create promotion'}
        </button>
      </form>
    </div>
  )
}
