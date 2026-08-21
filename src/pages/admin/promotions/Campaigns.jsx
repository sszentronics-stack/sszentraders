import { useEffect, useState } from 'react'
import * as promotionsApi from '../../../repositories/promotions.repository'

const EMPTY = { name: '', slug: '', description: '', status: 'draft' }

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    promotionsApi.listCampaigns().then(setCampaigns).catch((err) => setError(err?.message ?? 'Failed to load campaigns.'))
  }

  useEffect(load, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await promotionsApi.createCampaign(form)
      setForm(EMPTY)
      load()
    } catch (err) {
      setError(err?.message ?? 'Failed to create campaign.')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(campaign) {
    const nextStatus = campaign.status === 'active' ? 'paused' : 'active'
    try {
      await promotionsApi.updateCampaign(campaign.id, { status: nextStatus })
      load()
    } catch (err) {
      setError(err?.message ?? 'Failed to update campaign.')
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-10">
      <div>
        <h2 className="text-xl font-medium mb-4">Campaigns</h2>
        {error && <div className="form-banner form-banner-error mb-4">{error}</div>}
        {campaigns === null ? (
          <p className="text-ink-soft">Loading...</p>
        ) : campaigns.length === 0 ? (
          <p className="text-ink-soft text-sm">No campaigns yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line">
                <th className="py-2">Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-[#eee]">
                  <td className="py-2">{c.name}</td>
                  <td>{c.slug}</td>
                  <td>{c.status}</td>
                  <td>
                    <button type="button" className="text-xs underline" onClick={() => toggleStatus(c)}>
                      {c.status === 'active' ? 'Pause' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form onSubmit={handleCreate} className="bg-meta p-6 h-fit">
        <h3 className="font-medium mb-4">New campaign</h3>
        <div className="form-field">
          <label className="form-label" htmlFor="c-name">Name</label>
          <input id="c-name" className="form-input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="c-slug">Slug</label>
          <input id="c-slug" className="form-input" required value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="c-desc">Description</label>
          <textarea id="c-desc" className="form-input" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <button type="submit" className="btn-lavender w-auto px-6" disabled={submitting}>
          {submitting ? 'Saving...' : 'Create campaign'}
        </button>
      </form>
    </div>
  )
}
