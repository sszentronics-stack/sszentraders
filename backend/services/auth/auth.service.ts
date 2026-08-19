/**
 * Shared "wire an admin Supabase client into backend/lib/auth/linking.ts's
 * LinkCustomerDeps" builder. Factored out of supabase/functions/auth/index.ts's
 * previously-local makeLinkDeps so Phase 6's orders service can reuse the
 * exact same dedup-safe find-or-create-customer logic (ensureCustomerForProfile)
 * for guest checkout, instead of forking a second "does a customer exist for
 * this profile/email/phone" implementation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CustomerRow, LinkCustomerDeps } from '../../lib/auth/linking'

function mapCustomerRow(row: Record<string, unknown>): CustomerRow {
  return {
    id: row.id as string,
    profileId: row.profile_id as string | null,
    customerNumber: row.customer_number as string,
    firstName: row.first_name as string | null,
    lastName: row.last_name as string | null,
    email: row.email as string | null,
    phone: row.phone as string | null,
    marketingOptIn: row.marketing_opt_in as boolean,
    status: row.status as CustomerRow['status'],
  }
}

const CUSTOMER_COLUMNS =
  'id, profile_id, customer_number, first_name, last_name, email, phone, marketing_opt_in, status'

export function makeCustomerLinkDeps(admin: SupabaseClient): LinkCustomerDeps {
  return {
    async findCustomerByProfileId(profileId) {
      const { data, error } = await admin
        .from('customers')
        .select(CUSTOMER_COLUMNS)
        .eq('profile_id', profileId)
        .maybeSingle()
      if (error) throw error
      return data ? mapCustomerRow(data) : null
    },
    async findGuestCustomerByEmail(email) {
      const { data, error } = await admin
        .from('customers')
        .select(CUSTOMER_COLUMNS)
        .is('profile_id', null)
        .eq('email', email)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? mapCustomerRow(data) : null
    },
    async findGuestCustomerByPhone(phone) {
      const { data, error } = await admin
        .from('customers')
        .select(CUSTOMER_COLUMNS)
        .is('profile_id', null)
        .eq('phone', phone)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? mapCustomerRow(data) : null
    },
    async updateCustomer(id, patch) {
      const row: Record<string, unknown> = {}
      if (patch.firstName !== undefined) row.first_name = patch.firstName
      if (patch.lastName !== undefined) row.last_name = patch.lastName
      if (patch.email !== undefined) row.email = patch.email
      if (patch.phone !== undefined) row.phone = patch.phone
      if (patch.marketingOptIn !== undefined) row.marketing_opt_in = patch.marketingOptIn
      if (patch.profileId !== undefined) row.profile_id = patch.profileId
      const { data, error } = await admin.from('customers').update(row).eq('id', id).select(CUSTOMER_COLUMNS).single()
      if (error) throw error
      return mapCustomerRow(data)
    },
    async insertCustomer(row) {
      const { data, error } = await admin
        .from('customers')
        .insert({
          profile_id: row.profileId,
          customer_number: row.customerNumber,
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email,
          phone: row.phone,
          marketing_opt_in: row.marketingOptIn,
        })
        .select(CUSTOMER_COLUMNS)
        .single()
      if (error) throw error
      return mapCustomerRow(data)
    },
  }
}
