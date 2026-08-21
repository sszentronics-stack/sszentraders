import { useEffect, useState } from 'react'
import * as promotionsApi from '../../../repositories/promotions.repository'

const EMPTY = { promotionId: '', code: '', usageLimit: '', usageLimitPerCustomer: '', status: 'draft' }

export default function Coupons() {
  const [coupons, setCoupons] = useState(null)
  const [promotions, setPromotions] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [usage, setUsage] = useState(null)

  function load() {
    promotionsApi.listCoupons().then(setCoupons).catch((err) => setError(err?.message ?? 'Failed to load coupons.'))
    promotionsApi.listPromotions().then(setPromotions).catch(() => undefined)
  }

  useEffect(load, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await promotionsApi.createCoupon({
        promotionId: form.promotionId,
        code: form.code.trim().toUpperCase(),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        usageLimitPerCustomer: form.usageLimitPerCustomer ? Number(form.usageLimitPerCustomer) : undefined,
        status: form.status,
      })
      setForm(EMPTY)
      load()
    } catch (err) {
      setError(err?.message ?? 'Failed to create coupon.')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(coupon) {
    const nextStatus = coupon.status === 'active' ? 'paused' : 'active'
    try {
      await promotionsApi.updateCoupon(coupon.id, { status: nextStatus })
      load()
    } catch (err) {
      setError(err?.message ?? 'Failed to update coupon.')
    }
  }

  async function viewUsage(couponId) {
    try {
      setUsage(await promotionsApi.getCouponUsage(couponId))
    } catch (err) {
      setError(err?.message ?? 'Failed to load coupon usage.')
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-10">
      <div>
        <h2 className="text-xl font-medium mb-4">Coupons</h2>
        {error && <div className="form-banner form-banner-error mb-4">{error}</div>}
        {coupons === null ? (
          <p className="text-ink-soft">Loading...</p>
        ) : coupons.length === 0 ? (
          <p className="text-ink-soft text-sm">No coupons yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line">
                <th className="py-2">Code</th>
                <th>Used</th>
                <th>Limit</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-b border-[#eee]">
                  <td className="py-2 font-mono">{c.code}</td>
                  <td>{c.times_used}</td>
                  <td>{c.usage_limit ?? '∞'}</td>
                  <td>{c.status}</td>
                  <td className="space-x-2">
                    <button type="button" className="text-xs underline" onClick={() => toggleStatus(c)}>
                      {c.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" className="text-xs underline" onClick={() => viewUsage(c.id)}>
                      Usage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {usage && (
          <div className="mt-6 bg-meta p-4">
            <h3 className="font-medium mb-2">Redemptions for {usage.code}</h3>
            <p className="text-sm text-ink-soft mb-3">{usage.timesUsed} used{usage.usageLimit ? ` of ${usage.usageLimit}` : ''}</p>
            {usage.redemptions.length === 0 ? (
              <p className="text-sm text-ink-soft">No redemptions yet.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {usage.redemptions.map((r) => (
                  <li key={r.orderId} className="flex justify-between">
                    <span>{new Date(r.createdAt).toLocaleDateString()}{r.released ? ' (released)' : ''}</span>
                    <span>Rs. {(r.amount / 100).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleCreate} className="bg-meta p-6 h-fit">
        <h3 className="font-medium mb-4">New coupon</h3>
        <div className="form-field">
          <label className="form-label" htmlFor="cp-promo">Promotion</label>
          <select id="cp-promo" className="form-input" required value={form.promotionId} onChange={(e) => setForm((f) => ({ ...f, promotionId: e.target.value }))}>
            <option value="">Select a promotion</option>
            {promotions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="cp-code">Code</label>
          <input id="cp-code" className="form-input" required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="cp-limit">Total usage limit (optional)</label>
          <input id="cp-limit" type="number" min="1" className="form-input" value={form.usageLimit} onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="cp-per">Per-customer limit (optional)</label>
          <input id="cp-per" type="number" min="1" className="form-input" value={form.usageLimitPerCustomer} onChange={(e) => setForm((f) => ({ ...f, usageLimitPerCustomer: e.target.value }))} />
        </div>
        <button type="submit" className="btn-lavender w-auto px-6" disabled={submitting}>
          {submitting ? 'Saving...' : 'Create coupon'}
        </button>
      </form>
    </div>
  )
}
