/**
 * Data-access layer for the signed-in customer's own profile and addresses.
 * Following the pattern established in src/repositories/products.repository.ts:
 * this is the ONLY place in src/ that queries `profiles` / `customer_addresses`
 * directly — components call these functions, never `getSupabaseBrowserClient()`.
 *
 * Reads/writes here rely entirely on RLS (supabase/migrations/0014_row_level_
 * security.sql: profiles_self_read/update, customer_addresses_self_all) to
 * scope every query to the signed-in caller — there is no explicit "WHERE
 * owner = me" here because Postgres enforces it. Default-address swaps rely
 * on the trigger in 0016_address_default_enforcement.sql for atomicity.
 *
 * Profile+customer *linking* (dedup-safe creation after signup/login) is
 * intentionally NOT here — that privileged, transactional step goes through
 * the `auth` Edge Function (see src/context/AuthContext.jsx) because it
 * needs the service-role key to look across other customers' rows for the
 * dedup check, which RLS correctly forbids from this anon/authenticated
 * client.
 */
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import type { CustomerAddress } from '../../backend/lib/types/domain'
import type { Profile } from '../../backend/lib/types/profile'
import type { CreateCustomerAddressInput, UpdateCustomerAddressInput } from '../../backend/lib/validation/index'

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

interface AddressRow {
  id: string
  customer_id: string
  label: string | null
  recipient_name: string
  phone: string
  address_line_1: string
  address_line_2: string | null
  city: string
  province: string | null
  postal_code: string | null
  country: string
  is_default_shipping: boolean
  is_default_billing: boolean
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    status: row.status,
    isAdmin: row.is_admin,
  }
}

function mapAddress(row: AddressRow): CustomerAddress {
  return {
    id: row.id,
    customerId: row.customer_id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    country: row.country,
    isDefaultShipping: row.is_default_shipping,
    isDefaultBilling: row.is_default_billing,
  }
}

const PROFILE_COLUMNS = 'id, auth_user_id, first_name, last_name, email, phone, avatar_url, status, is_admin'
const ADDRESS_COLUMNS =
  'id, customer_id, label, recipient_name, phone, address_line_1, address_line_2, city, province, postal_code, country, is_default_shipping, is_default_billing'

export async function getMyProfile(): Promise<Profile | null> {
  const client = getSupabaseBrowserClient()
  let user = null
  const { data: userData, error: userError } = await client.auth.getUser()
  if (!userError && userData?.user) {
    user = userData.user
  } else {
    // getUser() can fail with some key setups; session is enough for RLS.
    const { data: sessionData } = await client.auth.getSession()
    user = sessionData.session?.user ?? null
  }
  if (!user) return null

  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(`Failed to load profile: ${error.message}`)
  return data ? mapProfile(data as ProfileRow) : null
}

async function getMyCustomerId(): Promise<string | null> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client.from('customers').select('id').maybeSingle()
  if (error) throw new Error(`Failed to resolve customer record: ${error.message}`)
  return (data as { id: string } | null)?.id ?? null
}

export async function listMyAddresses(): Promise<CustomerAddress[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('customer_addresses')
    .select(ADDRESS_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to list addresses: ${error.message}`)
  return ((data ?? []) as AddressRow[]).map(mapAddress)
}

export async function createAddress(input: CreateCustomerAddressInput): Promise<CustomerAddress> {
  const client = getSupabaseBrowserClient()
  const customerId = await getMyCustomerId()
  if (!customerId) {
    throw new Error('No customer record linked to this account yet. Please refresh and try again.')
  }

  const { data, error } = await client
    .from('customer_addresses')
    .insert({
      customer_id: customerId,
      label: input.label ?? null,
      recipient_name: input.recipientName,
      phone: input.phone,
      address_line_1: input.addressLine1,
      address_line_2: input.addressLine2 ?? null,
      city: input.city,
      province: input.province ?? null,
      postal_code: input.postalCode ?? null,
      country: input.country,
      landmark: input.landmark ?? null,
      is_default_shipping: input.isDefaultShipping ?? false,
      is_default_billing: input.isDefaultBilling ?? false,
    })
    .select(ADDRESS_COLUMNS)
    .single()
  if (error) throw new Error(`Failed to create address: ${error.message}`)
  return mapAddress(data as AddressRow)
}

export async function updateAddress(id: string, input: UpdateCustomerAddressInput): Promise<CustomerAddress> {
  const client = getSupabaseBrowserClient()
  const patch: Record<string, unknown> = {}
  if (input.label !== undefined) patch.label = input.label
  if (input.recipientName !== undefined) patch.recipient_name = input.recipientName
  if (input.phone !== undefined) patch.phone = input.phone
  if (input.addressLine1 !== undefined) patch.address_line_1 = input.addressLine1
  if (input.addressLine2 !== undefined) patch.address_line_2 = input.addressLine2
  if (input.city !== undefined) patch.city = input.city
  if (input.province !== undefined) patch.province = input.province
  if (input.postalCode !== undefined) patch.postal_code = input.postalCode
  if (input.country !== undefined) patch.country = input.country
  if (input.landmark !== undefined) patch.landmark = input.landmark
  if (input.isDefaultShipping !== undefined) patch.is_default_shipping = input.isDefaultShipping
  if (input.isDefaultBilling !== undefined) patch.is_default_billing = input.isDefaultBilling

  const { data, error } = await client
    .from('customer_addresses')
    .update(patch)
    .eq('id', id)
    .select(ADDRESS_COLUMNS)
    .single()
  if (error) throw new Error(`Failed to update address: ${error.message}`)
  return mapAddress(data as AddressRow)
}

export async function deleteAddress(id: string): Promise<void> {
  const client = getSupabaseBrowserClient()
  const { error } = await client.from('customer_addresses').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete address: ${error.message}`)
}

export async function setDefaultShippingAddress(id: string): Promise<CustomerAddress> {
  return updateAddress(id, { isDefaultShipping: true })
}

export async function setDefaultBillingAddress(id: string): Promise<CustomerAddress> {
  return updateAddress(id, { isDefaultBilling: true })
}
