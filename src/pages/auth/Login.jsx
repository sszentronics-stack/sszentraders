import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PasswordField from '../../components/auth/PasswordField'
import { useAuth } from '../../context/AuthContext'
import { useSeo } from '../../hooks/useSeo'

export default function Login() {
  useSeo({ title: 'Sign In | Aura Beauty Care', noindex: true })
  const { login, configured, isAuthenticated, initializing } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/account'

  useEffect(() => {
    // Covers the email-verification redirect landing here already signed in.
    if (!initializing && isAuthenticated) navigate(redirectTo, { replace: true })
  }, [initializing, isAuthenticated, navigate, redirectTo])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login({ email, password })
      navigate(redirectTo, { replace: true })
    } catch {
      setError('Incorrect email or password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to view your orders, addresses, and account details.</p>

        {!configured && (
          <div className="form-banner form-banner-error">Accounts are not configured yet. Please check back soon.</div>
        )}
        {error && <div className="form-banner form-banner-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={!configured}
            />
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          <div className="flex justify-end mb-5 -mt-2">
            <Link to="/forgot-password" className="text-xs text-ink-soft underline">
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="btn-lavender" disabled={submitting || !configured}>
            {submitting ? <span className="spinner" /> : 'Sign In'}
          </button>
        </form>

        <p className="auth-footer-link">
          New to Aura Beauty Care?{' '}
          <Link to={`/register${redirectTo !== '/account' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
