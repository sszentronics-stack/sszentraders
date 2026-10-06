/**
 * auth — maps to backend/services/auth (see that folder's README) and the
 * business logic in backend/lib/auth. Phase 1 shipped only an idempotent
 * "ensure profile row exists for this JWT" endpoint. Phase 2 (Customer
 * Authentication & Profiles) extends it to the full transactional identity
 * flow used after Supabase Auth signup/login, plus profile read/edit:
 *
 *   POST   /auth           Ensure a `profiles` row + linked `customers` row
 *                           exist for the caller's JWT (dedup-safe — see
 *                           backend/lib/auth/linking.ts). Call this once
 *                           right after signup and right after every login;
 *                           it is always safe to call again.
 *   GET    /auth/profile    Return the caller's profile + linked customer.
 *   PATCH  /auth/profile    Update profile/customer fields (name, phone,
 *                           marketing consent). Validated with
 *                           backend/lib/validation's updateProfileSchema.
 *
 * Registration/login/logout/password-reset themselves are NOT proxied
 * through this function — the Vite frontend calls Supabase Auth directly
 * (supabase.auth.signUp / signInWithPassword / signOut / resetPasswordForEmail
 * / updateUser) via src/context/AuthContext.jsx, exactly as Supabase Auth is
 * designed to be used from a browser SPA. This function's job is everything
 * that needs the service-role key: the transactional profile+customer
 * linking (dedup across email/phone), and reading/updating rows that RLS
 * would otherwise scope correctly but where we also want a single audited
 * write path for sensitive account changes.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { getSupabaseAdminClient, getSupabaseUserScopedClient } from '../_shared/supabaseAdmin.ts'
import { AuthenticationError, NotFoundError } from '../../../backend/lib/errors/index.ts'
import { writeAuditLog } from '../../../backend/lib/audit/index.ts'
import { parseOrThrow, updateProfileSchema } from '../../../backend/lib/validation/index.ts'
import { customerFillFromSignup, ensureCustomerForProfile, profilePatchFromSignup, type SignupMetadata } from '../../../backend/lib/auth/linking.ts'
import { makeCustomerLinkDeps as makeLinkDeps } from '../../../backend/services/auth/auth.service.ts'

interface ProfileRow {
  id: string
  auth_user_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  status: 'active' | 'inactive' | 'blocked'
  is_admin: boolean
}

async function requireCallerProfile(req: Request, admin: ReturnType<typeof getSupabaseAdminClient>) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new AuthenticationError('Missing Authorization header.')

  const userScoped = getSupabaseUserScopedClient(authHeader)
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser()
  if (userError || !user) throw new AuthenticationError('Invalid or expired session.')

  const { data: profile, error: upsertError } = await admin
    .from('profiles')
    .upsert(
      { auth_user_id: user.id, email: user.email ?? null },
      { onConflict: 'auth_user_id', ignoreDuplicates: false },
    )
    .select('id, auth_user_id, first_name, last_name, email, phone, avatar_url, status, is_admin')
    .single()
  if (upsertError) throw upsertError

  return { user, profile: profile as ProfileRow }
}

Deno.serve(
  withErrorHandling(async (req) => {
    const admin = getSupabaseAdminClient()
    const url = new URL(req.url)
    const isProfileRoute = url.pathname.endsWith('/profile')

    if (req.method === 'GET' && isProfileRoute) {
      const { profile } = await requireCallerProfile(req, admin)
      const deps = makeLinkDeps(admin)
      const customer = await deps.findCustomerByProfileId(profile.id)
      return okResponse({ profile, customer })
    }

    if (req.method === 'PATCH' && isProfileRoute) {
      const { profile } = await requireCallerProfile(req, admin)
      const body = await req.json().catch(() => ({}))
      const input = parseOrThrow(updateProfileSchema, body)

      const profilePatch: Record<string, unknown> = {}
      if (input.firstName !== undefined) profilePatch.first_name = input.firstName
      if (input.lastName !== undefined) profilePatch.last_name = input.lastName
      if (input.phone !== undefined) profilePatch.phone = input.phone

      let updatedProfile = profile
      if (Object.keys(profilePatch).length > 0) {
        const { data, error } = await admin
          .from('profiles')
          .update(profilePatch)
          .eq('id', profile.id)
          .select('id, auth_user_id, first_name, last_name, email, phone, avatar_url, status, is_admin')
          .single()
        if (error) throw error
        updatedProfile = data as ProfileRow
      }

      const deps = makeLinkDeps(admin)
      const result = await ensureCustomerForProfile(deps, {
        profileId: profile.id,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        marketingOptIn: input.marketingOptIn,
      })

      await writeAuditLog(admin, {
        actor: profile.id,
        actorType: 'customer',
        action: 'auth.profile_updated',
        entityType: 'profile',
        entityId: profile.id,
        metadata: { fields: Object.keys(body ?? {}) },
      })

      return okResponse({ profile: updatedProfile, customer: result.customer })
    }

    if (req.method === 'POST' && !isProfileRoute) {
      const { user, profile: loaded } = await requireCallerProfile(req, admin)
      const meta = (user.user_metadata ?? {}) as SignupMetadata
      const signupPatch = profilePatchFromSignup(loaded, meta)
      let profile = loaded
      if (Object.keys(signupPatch).length > 0) {
        const { data, error } = await admin
          .from('profiles')
          .update(signupPatch)
          .eq('id', loaded.id)
          .select('id, auth_user_id, first_name, last_name, email, phone, avatar_url, status, is_admin')
          .single()
        if (error) throw error
        profile = data as ProfileRow
      }
      const deps = makeLinkDeps(admin)
      const existing = await deps.findCustomerByProfileId(profile.id)
      const result = await ensureCustomerForProfile(deps, {
        profileId: profile.id,
        email: profile.email,
        ...customerFillFromSignup(existing, profile, meta),
      })

      await writeAuditLog(admin, {
        actor: profile.id,
        actorType: 'customer',
        action: result.created ? 'auth.registration_linked' : 'auth.login_linked',
        entityType: 'customer',
        entityId: result.customer.id,
        metadata: { claimedGuestCustomer: result.claimedGuestCustomer },
      })

      return okResponse({ profile, customer: result.customer })
    }

    throw new NotFoundError('route', 'No matching route for this method/path on the auth function.')
  }),
)
