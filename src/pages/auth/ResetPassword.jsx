import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PasswordField from '../../components/auth/PasswordField'
import { useAuth } from '../../context/AuthContext'
import { passwordResetConfirmSchema } from '../../../backend/lib/validation/index'

/**
 * Landing page for the link sent by requestPasswordReset(). Supabase puts
 * the visitor into a signed-in "recovery" session automatically when they
 * follow the emailed link (PASSWORD_RECOVERY auth event) — this page just
 * calls updateUser({ password }) on that session.
 */
export default function ResetPassword() {
  const { updatePassword, configured } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setFieldError('')
    const parsed = passwordResetConfirmSchema.safeParse({ password })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Invalid password')
      return
    }
    setSubmitting(true)
    try {
      await updatePassword(parsed.data.password)
      setDone(true)
      setTimeout(() => navigate('/account', { replace: true }), 1500)
    } catch {
      setError('This reset link is invalid or has expired. Please request a new one.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Set a new password</h1>
        <p className="auth-subtitle">Choose a new password for your SS Zen Traders account.</p>

        {done ? (
          <div className="form-banner form-banner-success">Password updated. Redirecting to your account...</div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {error && <div className="form-banner form-banner-error">{error}</div>}
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              error={fieldError}
            />
            <button type="submit" className="btn-lavender" disabled={submitting || !configured}>
              {submitting ? <span className="spinner" /> : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
