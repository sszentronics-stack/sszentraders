import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '../lib/supabase/client'
import { callEdgeFunction } from '../lib/supabase/functions'

const AuthContext = createContext(null)

function mapProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    authUserId: row.authUserId ?? row.auth_user_id ?? null,
    firstName: row.firstName ?? row.first_name ?? null,
    lastName: row.lastName ?? row.last_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
    status: row.status ?? null,
    isAdmin: Boolean(row.isAdmin ?? row.is_admin),
  }
}

/**
 * Customer identity state for the whole storefront. Wraps Supabase Auth
 * directly for signup/login/logout/password-reset (the browser SPA calling
 * Supabase Auth is the supported, documented pattern — no server hop
 * needed), and calls the `auth` Edge Function's transactional
 * ensure-profile-and-customer step (backend/lib/auth/linking.ts) whenever a
 * real session appears, so `profiles`/`customers` rows always exist and are
 * never duplicated.
 *
 * Deliberately does NOT force anonymous sign-in on every page load — that
 * would create a Supabase Auth user for every anonymous visitor, which is
 * unnecessary until Phase 5 actually needs a guest cart/checkout identity.
 * `ensureGuestSession()` is exposed here as the foundation Phase 5 will call
 * when it needs one (see supabase.auth.signInAnonymously — requires
 * "Allow anonymous sign-ins" enabled in the Supabase Auth dashboard; see
 * docs/phase-2-completion-report.md "Manual setup required").
 */
export function AuthProvider({ children }) {
  const configured = isSupabaseConfigured()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [initializing, setInitializing] = useState(configured)
  const [identityReady, setIdentityReady] = useState(!configured)

  const linkAndRefresh = useCallback(async () => {
    try {
      const result = await callEdgeFunction('auth', { method: 'POST' })
      setProfile(mapProfile(result?.profile))
      setCustomer(result?.customer ?? null)
    } catch (err) {
      // Non-fatal: the visitor is still signed in even if the linking call
      // fails transiently (e.g. cold start). Surfaced via console for
      // diagnosis; UI degrades to "signed in, profile not loaded yet".
      console.error('Failed to link profile/customer after sign-in.', err)
    }
  }, [])

  useEffect(() => {
    if (!configured) {
      setInitializing(false)
      return undefined
    }

    const client = getSupabaseBrowserClient()
    let cancelled = false

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setInitializing(false)
      if (data.session && !data.session.user?.is_anonymous) {
        linkAndRefresh().finally(() => {
          if (!cancelled) setIdentityReady(true)
        })
      } else {
        setIdentityReady(true)
      }
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setCustomer(null)
        setIdentityReady(true)
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && nextSession && !nextSession.user?.is_anonymous) {
        setIdentityReady(false)
        linkAndRefresh().finally(() => setIdentityReady(true))
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [configured, linkAndRefresh])

  const register = useCallback(async ({ email, password, firstName, lastName, phone, marketingOptIn, redirectTo }) => {
    const client = getSupabaseBrowserClient()
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName ?? null, last_name: lastName ?? null, phone: phone ?? null, marketing_opt_in: Boolean(marketingOptIn) },
        emailRedirectTo: redirectTo,
      },
    })
    if (error) throw error
    // If email confirmation is off, Supabase returns an active session
    // immediately and we can link right away; otherwise linking happens on
    // the SIGNED_IN event once the visitor verifies their email and logs in.
    if (data.session) await linkAndRefresh()
    return data
  }, [linkAndRefresh])

  const login = useCallback(async ({ email, password }) => {
    const client = getSupabaseBrowserClient()
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }, [])

  const logout = useCallback(async () => {
    const client = getSupabaseBrowserClient()
    await client.auth.signOut()
  }, [])

  /**
   * Deliberately generic success message regardless of whether the email is
   * registered — never confirm/deny account existence to the caller
   * (enumeration risk). Supabase Auth itself does not reveal this either.
   */
  const requestPasswordReset = useCallback(async (email) => {
    const client = getSupabaseBrowserClient()
    const redirectTo = `${window.location.origin}/reset-password`
    await client.auth.resetPasswordForEmail(email, { redirectTo })
  }, [])

  const updatePassword = useCallback(async (newPassword) => {
    const client = getSupabaseBrowserClient()
    const { error } = await client.auth.updateUser({ password: newPassword })
    if (error) throw error
  }, [])

  const resendVerificationEmail = useCallback(async (email) => {
    const client = getSupabaseBrowserClient()
    await client.auth.resend({ type: 'signup', email })
  }, [])

  /** Foundation for Phase 5 guest cart/checkout — not called automatically. */
  const ensureGuestSession = useCallback(async () => {
    const client = getSupabaseBrowserClient()
    const { data } = await client.auth.getSession()
    if (data.session) return data.session
    const { data: anon, error } = await client.auth.signInAnonymously()
    if (error) {
      const raw = error.message || 'Could not start a guest session.'
      throw new Error(
        /anonymous|not enabled|disabled/i.test(raw)
          ? 'Guest checkout is turned off. Sign in to place this order, or turn on anonymous sign-ins in Supabase Authentication.'
          : raw,
      )
    }
    if (!anon.session) throw new Error('Could not start a guest session.')
    setSession(anon.session)
    setIdentityReady(true)
    return anon.session
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session || session.user?.is_anonymous) return
    await linkAndRefresh()
  }, [session, linkAndRefresh])

  const value = useMemo(
    () => ({
      configured,
      initializing,
      identityReady,
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session?.user) && !session?.user?.is_anonymous,
      profile,
      customer,
      register,
      login,
      logout,
      requestPasswordReset,
      updatePassword,
      resendVerificationEmail,
      ensureGuestSession,
      refreshProfile,
    }),
    [
      configured,
      initializing,
      identityReady,
      session,
      profile,
      customer,
      register,
      login,
      logout,
      requestPasswordReset,
      updatePassword,
      resendVerificationEmail,
      ensureGuestSession,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
