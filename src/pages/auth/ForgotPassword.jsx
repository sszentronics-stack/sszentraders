import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { emailSchema } from '../../../backend/lib/validation/index'

/**
 * Always shows the same success message regardless of whether the email is
 * registered — Supabase's resetPasswordForEmail() itself does not reveal
 * this either, so we never introduce an enumeration side channel here.
 */
export default function ForgotPassword() {
  const { requestPasswordReset, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      setError('Please enter a valid email address.')
      return
    }
    setSubmitting(true)
    try {
      await requestPasswordReset(parsed.data)
    } catch {
      // Swallow — never reveal whether the request itself failed for a
      // reason that would leak account existence.
    } finally {
      setSubmitting(false)
      setSubmitted(true)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Reset your password</h1>
        <p className="auth-subtitle">Enter your email and we will send you a link to reset your password.</p>

        {submitted ? (
          <div className="form-banner form-banner-success">
            If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {error && <div className="form-banner form-banner-error">{error}</div>}
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
            <button type="submit" className="btn-lavender" disabled={submitting || !configured}>
              {submitting ? <span className="spinner" /> : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="auth-footer-link">
          <Link to="/login">Back to Sign In</Link>
        </p>
      </div>
    </div>
  )
}
