import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { callEdgeFunction } from '../../lib/supabase/functions'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { loadLocalProfile, saveLocalProfile } from '../../lib/localAccount'
import { updateProfileSchema } from '../../../backend/lib/validation/index'

export default function Profile() {
  const { profile, customer, refreshProfile, user } = useAuth()
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', marketingOptIn: false })
  const [fieldErrors, setFieldErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const local = loadLocalProfile()
      setForm({
        firstName: local.firstName ?? '',
        lastName: local.lastName ?? '',
        phone: local.phone ?? '',
        marketingOptIn: Boolean(local.marketingOptIn),
      })
      return
    }
    setForm({
      firstName: profile?.firstName ?? '',
      lastName: profile?.lastName ?? '',
      phone: profile?.phone ?? customer?.phone ?? '',
      marketingOptIn: Boolean(customer?.marketingOptIn),
    })
  }, [profile, customer])

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFieldErrors({})
    setErrorMessage('')

    const result = updateProfileSchema.safeParse({
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      phone: form.phone || undefined,
      marketingOptIn: form.marketingOptIn,
    })
    if (!result.success) {
      const errors = {}
      for (const issue of result.error.issues) errors[issue.path[0]] = issue.message
      setFieldErrors(errors)
      return
    }

    setStatus('saving')
    try {
      if (!isSupabaseConfigured()) {
        saveLocalProfile(result.data)
        window.dispatchEvent(new Event('sszentronics-account'))
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2500)
        return
      }
      await callEdgeFunction('auth/profile', { method: 'PATCH', body: result.data })
      await refreshProfile()
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (err) {
      setStatus('error')
      setErrorMessage(err?.message ?? 'Could not save your changes. Please try again.')
    }
  }

  return (
    <div>
      <h2 className="h3 mb-4">Profile details</h2>

      {status === 'saved' && <div className="alert alert-success">Your profile has been updated.</div>}
      {status === 'error' && <div className="alert alert-danger">{errorMessage}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <label className="form-label" htmlFor="account-email">
            Email
          </label>
          <input id="account-email" className="form-control" value={user?.email ?? ''} disabled readOnly placeholder="Saved on this device" />
          <div className="form-text">Email changes are not supported yet. Message us on WhatsApp if you need help.</div>
        </div>

        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="firstName">
              First name
            </label>
            <input
              id="firstName"
              className="form-control"
              value={form.firstName}
              onChange={(e) => setField('firstName')(e.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="lastName">
              Last name
            </label>
            <input
              id="lastName"
              className="form-control"
              value={form.lastName}
              onChange={(e) => setField('lastName')(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-3 mt-3">
          <label className="form-label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            className={`form-control${fieldErrors.phone ? ' is-invalid' : ''}`}
            aria-invalid={Boolean(fieldErrors.phone)}
            value={form.phone}
            onChange={(e) => setField('phone')(e.target.value)}
            placeholder="03XXXXXXXXX"
          />
          {fieldErrors.phone && <div className="invalid-feedback">{fieldErrors.phone}</div>}
        </div>

        <div className="form-check mb-4">
          <input
            id="marketing"
            className="form-check-input"
            type="checkbox"
            checked={form.marketingOptIn}
            onChange={(e) => setField('marketingOptIn')(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="marketing">
            Send me offers and updates from SSzentronics.
          </label>
        </div>

        <button type="submit" className="btn btn-dark px-4" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
