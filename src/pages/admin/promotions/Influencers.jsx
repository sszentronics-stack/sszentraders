import { useState } from 'react'
import { isSupabaseConfigured } from '../../../lib/supabase/client'
import {
  createInfluencerCode,
  describeInfluencerDiscount,
  listInfluencerCodes,
  updateInfluencerCode,
} from '../../../lib/influencerCodes'
import * as promotionsApi from '../../../repositories/promotions.repository'
import { toMinorUnits } from '../../../../backend/lib/money/index'

const EMPTY = {
  influencerName: '',
  handle: '',
  platform: 'Instagram',
  code: '',
  discountType: 'percentage',
  discountValue: '15',
  commissionPercent: '10',
  usageLimit: '',
  notes: '',
}

export default function Influencers() {
  const [codes, setCodes] = useState(() => listInfluencerCodes())
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function refresh() {
    setCodes(listInfluencerCodes())
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      const created = createInfluencerCode({
        influencerName: form.influencerName,
        handle: form.handle,
        platform: form.platform,
        code: form.code,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        commissionPercent: Number(form.commissionPercent),
        usageLimit: form.usageLimit,
        notes: form.notes,
        status: 'active',
      })

      if (isSupabaseConfigured()) {
        try {
          const promotion = await promotionsApi.createPromotion({
            name: `${created.influencerName} · ${created.code}`,
            description: `Influencer code for ${created.handle || created.influencerName} on ${created.platform}. Commission ${created.commissionPercent}%.`,
            discountType: created.discountType,
            discountValue:
              created.discountType === 'fixed_amount' ? toMinorUnits(created.discountValue) : created.discountValue,
            status: 'active',
            appliesTo: 'all',
          })
          const coupon = await promotionsApi.createCoupon({
            promotionId: promotion.id,
            code: created.code,
            usageLimit: created.usageLimit ?? undefined,
            status: 'active',
          })
          updateInfluencerCode(created.id, { promotionId: promotion.id, couponId: coupon.id })
          setNotice('Code saved and synced to checkout.')
        } catch (err) {
          setNotice(err?.message ? `Saved on this device. Checkout sync failed: ${err.message}` : 'Saved on this device.')
        }
      } else {
        setNotice('Code is live on this store. Customers can use it in the cart.')
      }

      setForm(EMPTY)
      refresh()
    } catch (err) {
      setError(err?.message ?? 'Could not create this influencer code.')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(row) {
    const nextStatus = row.status === 'active' ? 'paused' : 'active'
    setError('')
    try {
      updateInfluencerCode(row.id, { status: nextStatus })
      if (row.couponId && isSupabaseConfigured()) {
        await promotionsApi.updateCoupon(row.couponId, { status: nextStatus })
      }
      refresh()
    } catch (err) {
      setError(err?.message ?? 'Could not update this code.')
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-10">
      <div>
        <h2 className="text-xl font-medium mb-2">Influencer promo codes</h2>
        <p className="text-sm text-ink-soft mb-4">
          Create a code for each creator. The discount shows on the gallery and comes off the cart. Each mobile number can use a code only once.
        </p>
        {error && <div className="form-banner form-banner-error mb-4">{error}</div>}
        {notice && <div className="form-banner form-banner-success mb-4">{notice}</div>}
        {codes.length === 0 ? (
          <p className="text-ink-soft text-sm">No influencer codes yet. Add the first one on the right.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-soft border-b border-line">
                  <th className="py-2 pr-3">Influencer</th>
                  <th className="pr-3">Code</th>
                  <th className="pr-3">Offer</th>
                  <th className="pr-3">Commission</th>
                  <th className="pr-3">Used</th>
                  <th className="pr-3">Phones</th>
                  <th className="pr-3">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((row) => (
                  <tr key={row.id} className="border-b border-[#eee] align-top">
                    <td className="py-3 pr-3">
                      <div className="font-medium">{row.influencerName}</div>
                      <div className="text-ink-soft text-xs">
                        {row.platform}
                        {row.handle ? ` · ${row.handle}` : ''}
                      </div>
                    </td>
                    <td className="pr-3 font-mono">{row.code}</td>
                    <td className="pr-3">{describeInfluencerDiscount(row)}</td>
                    <td className="pr-3">{row.commissionPercent}%</td>
                    <td className="pr-3">
                      {row.timesUsed}
                      {row.usageLimit != null ? ` / ${row.usageLimit}` : ''}
                    </td>
                    <td className="pr-3">{row.redeemedPhones?.length || 0}</td>
                    <td className="pr-3 capitalize">{row.status}</td>
                    <td>
                      <button type="button" className="text-xs underline" onClick={() => toggleStatus(row)}>
                        {row.status === 'active' ? 'Pause' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={handleCreate} className="bg-meta p-6 h-fit">
        <h3 className="font-medium mb-4">New influencer code</h3>
        <div className="form-field">
          <label className="form-label" htmlFor="inf-name">Influencer name</label>
          <input id="inf-name" className="form-input" required value={form.influencerName} onChange={(e) => setForm((f) => ({ ...f, influencerName: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="inf-handle">Handle</label>
          <input id="inf-handle" className="form-input" placeholder="@username" value={form.handle} onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="inf-platform">Platform</label>
          <select id="inf-platform" className="form-input" value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}>
            <option>Instagram</option>
            <option>TikTok</option>
            <option>YouTube</option>
            <option>Other</option>
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="inf-code">Promo code</label>
          <input id="inf-code" className="form-input" required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="AYNA15" />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="inf-type">Customer discount</label>
          <select id="inf-type" className="form-input" value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}>
            <option value="percentage">Percentage</option>
            <option value="fixed_amount">Fixed amount (Rs.)</option>
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="inf-value">{form.discountType === 'percentage' ? 'Percent off' : 'Rupees off'}</label>
          <input id="inf-value" type="number" min="1" className="form-input" required value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="inf-commission">Influencer commission (%)</label>
          <input id="inf-commission" type="number" min="0" max="100" className="form-input" value={form.commissionPercent} onChange={(e) => setForm((f) => ({ ...f, commissionPercent: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="inf-limit">Usage limit (optional)</label>
          <input id="inf-limit" type="number" min="1" className="form-input" value={form.usageLimit} onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="inf-notes">Notes</label>
          <textarea id="inf-notes" className="form-input" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <button type="submit" className="btn-lavender w-auto px-6" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add influencer code'}
        </button>
      </form>
    </div>
  )
}
