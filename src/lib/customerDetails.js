import { getAppliedInfluencerPromo } from './influencerCodes'
import { loadLocalAddresses, loadLocalProfile, saveLocalAddress, saveLocalProfile } from './localAccount'

function text(...values) {
  for (const value of values) {
    const next = String(value ?? '').trim()
    if (next) return next
  }
  return ''
}

function profileValue(profile, camel, snake) {
  return text(profile?.[camel], profile?.[snake])
}

function defaultLocalAddress() {
  const rows = loadLocalAddresses()
  return rows.find((row) => row.isDefaultShipping) ?? rows[0] ?? null
}

/** Saved profile, then address, promo phone, this device, then signup metadata. */
export function knownCustomer({ profile, customer, user, address } = {}) {
  const local = loadLocalProfile()
  const saved = address ?? defaultLocalAddress()
  const applied = getAppliedInfluencerPromo()
  const meta = user?.user_metadata ?? {}
  const firstName = text(profileValue(profile, 'firstName', 'first_name'), customer?.firstName, meta.first_name, local.firstName)
  const lastName = text(profileValue(profile, 'lastName', 'last_name'), customer?.lastName, meta.last_name, local.lastName)
  const phone = text(
    profileValue(profile, 'phone', 'phone'),
    customer?.phone,
    saved?.phone,
    applied?.phone,
    local.phone,
    meta.phone,
  )
  const email = text(user?.email, profileValue(profile, 'email', 'email'), customer?.email)
  const name = text(saved?.recipientName, [firstName, lastName].filter(Boolean).join(' '))
  return {
    firstName,
    lastName,
    name,
    phone,
    email,
    addressLine1: text(saved?.addressLine1),
    addressLine2: text(saved?.addressLine2),
    city: text(saved?.city),
    province: text(saved?.province),
    postalCode: text(saved?.postalCode),
    marketingOptIn: Boolean(customer?.marketingOptIn ?? meta.marketing_opt_in ?? local.marketingOptIn),
  }
}

export function addressIsComplete(address) {
  return Boolean(address?.recipientName?.trim() && address?.phone?.trim() && address?.addressLine1?.trim() && address?.city?.trim())
}

/** Keep name, phone, and address on this device for the next visit. */
export function rememberLocalCheckout({ name, phone, city, address, addressLine2, province, postalCode }) {
  const local = loadLocalProfile()
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  saveLocalProfile({
    firstName: local.firstName || parts[0] || '',
    lastName: local.lastName || parts.slice(1).join(' '),
    phone: phone || local.phone || '',
    marketingOptIn: Boolean(local.marketingOptIn),
  })
  if (!String(address || '').trim() || !String(city || '').trim()) return
  const rows = loadLocalAddresses()
  const existing = rows.find((row) => row.isDefaultShipping) ?? rows[0]
  saveLocalAddress(existing?.id, {
    label: existing?.label || 'Home',
    recipientName: String(name || '').trim() || [local.firstName, local.lastName].filter(Boolean).join(' '),
    phone: phone || existing?.phone || '',
    addressLine1: address,
    addressLine2: addressLine2 || existing?.addressLine2 || '',
    city,
    province: province || existing?.province || '',
    postalCode: postalCode || existing?.postalCode || '',
    country: existing?.country || 'PK',
    isDefaultShipping: true,
    isDefaultBilling: Boolean(existing?.isDefaultBilling),
  })
}
