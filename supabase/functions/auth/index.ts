/**
 * auth — maps to backend/services/auth (see that folder's README for the
 * phase mapping). Phase 1 ships only the minimal groundwork: given an
 * authenticated Supabase Auth JWT, ensure a matching `profiles` row exists
 * (idempotent upsert). This is infrastructure, not a login/signup UI —
 * Phase 2 (Customer Authentication & Profiles) builds the actual
 * auth flows (signup, login, password reset, OAuth) on top of this.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { getSupabaseAdminClient, getSupabaseUserScopedClient } from '../_shared/supabaseAdmin.ts'
import { AuthenticationError } from '../../../backend/lib/errors/index.ts'
import { writeAuditLog } from '../../../backend/lib/audit/index.ts'

Deno.serve(
  withErrorHandling(async (req) => {
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
        { auth_user_id: user.id, email: user.email ?? null },
        { onConflict: 'auth_user_id', ignoreDuplicates: false },
      )
      .select('id, auth_user_id, email, status')
      .single()

    if (upsertError) throw upsertError

    await writeAuditLog(admin, {
      actor: profile.id,
      actorType: 'customer',
      action: 'auth.profile_ensured',
      entityType: 'profile',
      entityId: profile.id,
    })

    return okResponse({ profile })
  }),
)
