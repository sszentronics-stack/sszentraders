const PROFILE_KEY = 'sszentronics.local-profile'
const ADDRESS_KEY = 'sszentronics.local-addresses'

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function loadLocalProfile() {
  return readJson(PROFILE_KEY, {
    firstName: '',
    lastName: '',
    phone: '',
    marketingOptIn: false,
  })
}

export function saveLocalProfile(profile) {
  const next = {
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    phone: profile.phone || '',
    marketingOptIn: Boolean(profile.marketingOptIn),
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
  return next
}

export function loadLocalAddresses() {
  const rows = readJson(ADDRESS_KEY, [])
  return Array.isArray(rows) ? rows : []
}

export function saveLocalAddress(id, data) {
  const rows = loadLocalAddresses()
  const next = {
    id: id || crypto.randomUUID(),
    label: data.label || '',
    recipientName: data.recipientName,
    phone: data.phone,
    addressLine1: data.addressLine1,
    addressLine2: data.addressLine2 || '',
    city: data.city,
    province: data.province || '',
    postalCode: data.postalCode || '',
    country: data.country || 'PK',
    isDefaultShipping: Boolean(data.isDefaultShipping),
    isDefaultBilling: Boolean(data.isDefaultBilling),
  }
  const without = rows.filter((row) => row.id !== next.id).map((row) => ({
    ...row,
    isDefaultShipping: next.isDefaultShipping ? false : row.isDefaultShipping,
    isDefaultBilling: next.isDefaultBilling ? false : row.isDefaultBilling,
  }))
  localStorage.setItem(ADDRESS_KEY, JSON.stringify([next, ...without]))
  return next
}

export function deleteLocalAddress(id) {
  localStorage.setItem(ADDRESS_KEY, JSON.stringify(loadLocalAddresses().filter((row) => row.id !== id)))
}

export function setLocalDefaultAddress(id, kind) {
  const key = kind === 'billing' ? 'isDefaultBilling' : 'isDefaultShipping'
  const rows = loadLocalAddresses().map((row) => ({ ...row, [key]: row.id === id }))
  localStorage.setItem(ADDRESS_KEY, JSON.stringify(rows))
}
