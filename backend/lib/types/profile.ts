/**
 * Phase 2 domain type for `profiles` (see backend/lib/types/domain.ts header
 * for why these are hand-written rather than CLI-generated). Kept in its own
 * file rather than appended to domain.ts to avoid touching that shared file
 * while Phase 3 (Product Catalog) is being built in parallel off the same
 * base commit.
 */

export interface Profile {
  id: string
  authUserId: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  avatarUrl: string | null
  status: 'active' | 'inactive' | 'blocked'
  isAdmin: boolean
}
