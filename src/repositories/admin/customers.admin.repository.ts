/**
 * Admin customer list/search/detail — direct RLS-scoped reads
 * (`customers_admin_all`, `customer_addresses_admin_all`, `orders_admin_all`,
 * 0014_row_level_security.sql). No customer-mutation UI ships here per the
 * phase spec ("profile, addresses, order history, preferences/consent" —
 * read-only browsing); customers manage their own profile/addresses from
 * the storefront's /account area.
 */
import { getSupabaseBrowserClient } from '../../lib/supabase/client'

export interface AdminCustomerListItem {
  id: string
  customerNumber: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  status: 'active' | 'inactive' | 'blocked'
  marketingOptIn: boolean
  createdAt: string
}

const CUSTOMER_SELECT = 'id, customer_number, first_name, last_name, email, phone, status, marketing_opt_in, created_at'

function mapCustomer(row: any): AdminCustomerListItem {
  return {
    id: row.id,
    customerNumber: row.customer_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    marketingOptIn: row.marketing_opt_in,
    createdAt: row.created_at,
  }
}

export async function listAdminCustomers(params: { search?: string; limit?: number; offset?: number } = {}): Promise<{ items: AdminCustomerListItem[]; total: number }> {
  const client = getSupabaseBrowserClient()
  const limit = params.limit ?? 25
  const offset = params.offset ?? 0
  let query = client.from('customers').select(CUSTOMER_SELECT, { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (params.search) {
    const term = params.search.trim()
    query = query.or(`email.ilike.%${term}%,phone.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,customer_number.ilike.%${term}%`)
  }
  const { data, error, count } = await query
  if (error) throw new Error(`Failed to list customers: ${error.message}`)
  const items = ((data ?? []) as any[]).map(mapCustomer)
  return { items, total: count ?? items.length }
}

export interface AdminCustomerDetail extends AdminCustomerListItem {
  dateOfBirth: string | null
  hasAccount: boolean
  addresses: {
    id: string
    label: string | null
    recipientName: string
    phone: string
    addressLine1: string
    addressLine2: string | null
    city: string
    province: string | null
    postalCode: string | null
    country: string
    isDefaultShipping: boolean
    isDefaultBilling: boolean
  }[]
  orders: { id: string; orderNumber: string; grandTotal: number; currency: string; orderStatus: string; placedAt: string }[]
}

export async function getAdminCustomerDetail(id: string): Promise<AdminCustomerDetail | null> {
  const client = getSupabaseBrowserClient()
  const { data: customer, error } = await client
    .from('customers')
    .select(`${CUSTOMER_SELECT}, date_of_birth, profile_id`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Failed to load customer: ${error.message}`)
  if (!customer) return null

  const [{ data: addresses, error: addrError }, { data: orders, error: ordersError }] = await Promise.all([
    client
      .from('customer_addresses')
      .select('id, label, recipient_name, phone, address_line_1, address_line_2, city, province, postal_code, country, is_default_shipping, is_default_billing')
      .eq('customer_id', id),
    client
      .from('orders')
      .select('id, order_number, grand_total, currency, order_status, placed_at')
      .eq('customer_id', id)
      .order('placed_at', { ascending: false }),
  ])
  if (addrError) throw new Error(`Failed to load addresses: ${addrError.message}`)
  if (ordersError) throw new Error(`Failed to load order history: ${ordersError.message}`)

  return {
    ...mapCustomer(customer),
    dateOfBirth: (customer as any).date_of_birth,
    hasAccount: Boolean((customer as any).profile_id),
    addresses: ((addresses ?? []) as any[]).map((row) => ({
      id: row.id,
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
    })),
    orders: ((orders ?? []) as any[]).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      grandTotal: row.grand_total,
      currency: row.currency,
      orderStatus: row.order_status,
      placedAt: row.placed_at,
    })),
  }
}
