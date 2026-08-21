/**
 * Shared "is this caller an admin" check, factored out of
 * supabase/functions/products/index.ts so the same logic can be reused by
 * supabase/functions/catalog/index.ts (and any future privileged catalog
 * function) without copy-pasting the JWT-verify + profiles.is_admin lookup.
 *
 * Verifies the caller's JWT (via the anon-key, user-scoped client — never
 * trusts a client-asserted user id) and then looks up profiles.is_admin
 * with the service-role client. Throws AuthenticationError /
 * AuthorizationError (never returns a boolean silently) so every Edge
 * Function handler gets the same 401 vs 403 behavior for free via
 * withErrorHandling.
 */
import { getSupabaseAdminClient, getSupabaseUserScopedClient } from './supabaseAdmin.ts'
import { AuthenticationError, AuthorizationError } from '../../../backend/lib/errors/index.ts'

export interface AdminCaller {
  profileId: string
  authUserId: string
}

export async function requireAdmin(req: Request): Promise<AdminCaller> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new AuthenticationError('Missing Authorization header.')

  const userScoped = getSupabaseUserScopedClient(authHeader)
  const {
    data: { user },
  } = await userScoped.auth.getUser()
  if (!user) throw new AuthenticationError('Invalid or expired session.')

  const admin = getSupabaseAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) throw new AuthorizationError('Only admins can perform this action.')

  return { profileId: profile.id as string, authUserId: user.id }
}
