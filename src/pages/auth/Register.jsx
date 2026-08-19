import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PasswordField from '../../components/auth/PasswordField'
import { useAuth } from '../../context/AuthContext'
import { registerInputSchema } from '../../../backend/lib/validation/index'

export default function Register() {
  const { register, configured } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/account'

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    marketingOptIn: false,
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    const result = registerInputSchema.safeParse({
      email: form.email,
      password: form.password,
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

    setSubmitting(true)
    try {
      const data = await register({
        ...result.data,
        redirectTo: `${window.location.origin}/login`,
      })
      if (data.session) {
        navigate(redirectTo, { replace: true })
      } else {
        setNeedsVerification(true)
      }
    } catch (err) {
      setError(err?.message?.includes('already registered') ? 'That email is already registered. Try signing in instead.' : 'We could not create your account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (needsVerification) {
    return (
      <div className="auth-shell">
        <div className="auth-card text-center">
          <h1 className="auth-title">Check your inbox</h1>
          <p className="auth-subtitle">
            We sent a verification link to <strong>{form.email}</strong>. Confirm your email, then sign in to
            continue.
          </p>
          <Link to="/login" className="btn-lavender inline-block w-auto px-8">
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Save your details for faster checkout and track your orders.</p>

        {!configured && (
          <div className="form-banner form-banner-error">Accounts are not configured yet. Please check back soon.</div>
        )}
        {error && <div className="form-banner form-banner-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-field">
              <label className="form-label" htmlFor="firstName">
                First name
              </label>
              <input
                id="firstName"
                className="form-input"
                value={form.firstName}
                onChange={(e) => setField('firstName')(e.target.value)}
                autoComplete="given-name"
                disabled={!configured}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="lastName">
                Last name
              </label>
              <input
                id="lastName"
                className="form-input"
                value={form.lastName}
                onChange={(e) => setField('lastName')(e.target.value)}
                autoComplete="family-name"
                disabled={!configured}
              />
            </div>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              aria-invalid={Boolean(fieldErrors.email)}
              value={form.email}
              onChange={(e) => setField('email')(e.target.value)}
              autoComplete="email"
              required
              disabled={!configured}
            />
            {fieldErrors.email && <p className="form-error">{fieldErrors.email}</p>}
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="phone">
              Phone (optional)
            </label>
            <input
              id="phone"
              className="form-input"
              aria-invalid={Boolean(fieldErrors.phone)}
              value={form.phone}
              onChange={(e) => setField('phone')(e.target.value)}
              placeholder="03XXXXXXXXX"
              autoComplete="tel"
              disabled={!configured}
            />
            {fieldErrors.phone && <p className="form-error">{fieldErrors.phone}</p>}
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={setField('password')}
            autoComplete="new-password"
            error={fieldErrors.password}
          />
          <p className="form-hint -mt-3 mb-4">At least 8 characters.</p>

          <label className="form-checkbox-row">
            <input
              type="checkbox"
              checked={form.marketingOptIn}
              onChange={(e) => setField('marketingOptIn')(e.target.checked)}
              disabled={!configured}
            />
            <span>Send me offers and updates from Aura Beauty Care.</span>
          </label>

          <button type="submit" className="btn-lavender" disabled={submitting || !configured}>
            {submitting ? <span className="spinner" /> : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer-link">
          Already have an account?{' '}
          <Link to={`/login${redirectTo !== '/account' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
