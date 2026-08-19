/**
 * Shared "who is calling, and do they have a profiles row" resolver.
 *
 * Same JWT-verify + profiles-upsert shape as auth/index.ts's local
 * requireCallerProfile (kept separate there because it also selects the
 * full profile-detail columns that function's GET/PATCH routes need), shared
 * here so supabase/functions/cart/index.ts doesn't fork a second copy of
 * the auth logic itself — same "don't duplicate services/types/utilities"
 * rule Phase 3 followed for _shared/adminAuth.ts.
 *
 * Deliberately upserts a `profiles` row for ANY valid Supabase Auth JWT,
 * including an anonymous-auth session (supabase.auth.signInAnonymously) —
 * unlike auth/index.ts's own linking flow (which only links a `customers`
 * row for non-anonymous sign-ins), a guest still needs a `profiles.id` to
 * own a cart/wishlist/recently-viewed rows under RLS's current_profile_id()
 * (0014_row_level_security.sql). This is the guest identity mechanism Phase
 * 2 scaffolded (AuthContext.ensureGuestSession) and Phase 5 is the first to
 * actually consume.
 */
import { getSupabaseAdminClient, getSupabaseUserScopedClient } from './supabaseAdmin.ts'
import { AuthenticationError } from '../../../backend/lib/errors/index.ts'

export interface CallerProfile {
  id: string
  authUserId: string
  isAdmin: boolean
  isAnonymous: boolean
}

export async function requireCallerProfile(req: Request): Promise<CallerProfile> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new AuthenticationError('Missing Authorization header.')

  const userScoped = getSupabaseUserScopedClient(authHeader)
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser()
  if (userError || !user) throw new AuthenticationError('Invalid or expired session.')

  const admin = getSupabaseAdminClient()
  const { data: profile, error: upsertError } = await admin
    .from('profiles')
    .upsert(
      { auth_user_id: user.id, email: user.is_anonymous ? null : user.email ?? null },
      { onConflict: 'auth_user_id', ignoreDuplicates: false },
    )
    .select('id, auth_user_id, is_admin')
    .single()
  if (upsertError) throw upsertError

  return {
    id: profile.id as string,
    authUserId: user.id,
    isAdmin: Boolean(profile.is_admin),
    isAnonymous: Boolean(user.is_anonymous),
  }
}
