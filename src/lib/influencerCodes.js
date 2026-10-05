/**
 * Influencer promo codes created in the admin panel.
 * Stored on this device so codes work at cart and checkout even when
 * Supabase is not connected. When Supabase is connected, the admin page
 * also creates a matching server promotion and coupon.
 */

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'sszentronics.influencer-codes'
const APPLIED_KEY = 'sszentronics.applied-influencer-promo'
const PHONE_PATTERN = /^(\+92|0)?3\d{9}$/

/** 0300… and +92300… become the same 92300… key. */
export function normalizePhone(raw) {
  const trimmed = String(raw || '').trim()
  if (!PHONE_PATTERN.test(trimmed)) return ''
  const digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('92')) return digits
  if (digits.startsWith('0')) return `92${digits.slice(1)}`
  return `92${digits}`
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function listInfluencerCodes() {
  return readAll().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export function createInfluencerCode(input) {
  const code = String(input.code || '').trim().toUpperCase()
  if (!code) throw new Error('Enter a promo code.')
  const rows = readAll()
  if (rows.some((row) => row.code === code)) {
    throw new Error('That promo code already exists.')
  }
  const record = {
    id: crypto.randomUUID(),
    influencerName: String(input.influencerName || '').trim(),
    handle: String(input.handle || '').trim(),
    platform: input.platform || 'Instagram',
    code,
    discountType: input.discountType === 'fixed_amount' ? 'fixed_amount' : 'percentage',
    discountValue: Number(input.discountValue),
    commissionPercent: Number(input.commissionPercent) || 0,
    usageLimit: input.usageLimit ? Number(input.usageLimit) : null,
    timesUsed: 0,
    redeemedPhones: [],
    status: input.status === 'paused' ? 'paused' : 'active',
    notes: String(input.notes || '').trim(),
    promotionId: input.promotionId || null,
    couponId: input.couponId || null,
    createdAt: new Date().toISOString(),
  }
  if (!record.influencerName) throw new Error('Enter the influencer name.')
  if (!Number.isFinite(record.discountValue) || record.discountValue <= 0) {
    throw new Error('Enter a discount greater than zero.')
  }
  if (record.discountType === 'percentage' && record.discountValue > 100) {
    throw new Error('Percentage discount cannot be more than 100.')
  }
  writeAll([record, ...rows])
  return record
}

export function updateInfluencerCode(id, patch) {
  const rows = readAll()
  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) throw new Error('Influencer code not found.')
  const next = { ...rows[index], ...patch, id }
  rows[index] = next
  writeAll(rows)
  return next
}

export function findInfluencerCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase()
  return readAll().find((item) => item.code === code) || null
}

function phoneAlreadyUsed(row, phoneKey) {
  return (row.redeemedPhones || []).includes(phoneKey)
}

export function quoteInfluencerCode(rawCode, subtotalMajor, rawPhone) {
  const code = String(rawCode || '').trim().toUpperCase()
  const row = findInfluencerCode(code)
  const empty = {
    eligible: false,
    reasons: ['This promo code is not active.'],
    discountAmount: 0,
    discountMajor: 0,
    freeShipping: false,
    couponCode: code,
    promotionName: null,
  }
  if (!row || row.status !== 'active') return empty
  const phoneKey = normalizePhone(rawPhone)
  if (!phoneKey) {
    return { ...empty, promotionName: row.influencerName, reasons: ['Enter a valid mobile number. Each number can use this code once.'] }
  }
  if (phoneAlreadyUsed(row, phoneKey)) {
    return { ...empty, promotionName: row.influencerName, reasons: ['This phone number has already used this code.'] }
  }
  if (row.usageLimit != null && row.timesUsed >= row.usageLimit) {
    return { ...empty, promotionName: row.influencerName, reasons: ['This promo code has reached its usage limit.'] }
  }
  const subtotal = Number(subtotalMajor) || 0
  const discountMajor =
    row.discountType === 'percentage'
      ? Math.round((subtotal * row.discountValue) / 100)
      : Math.min(subtotal, row.discountValue)
  return {
    eligible: true,
    reasons: [],
    discountAmount: Math.round(discountMajor * 100),
    discountMajor,
    freeShipping: false,
    couponCode: row.code,
    promotionName: row.influencerName,
    influencerHandle: row.handle,
    discountType: row.discountType,
    discountValue: row.discountValue,
    phoneKey,
  }
}

export function getAppliedInfluencerPromo() {
  try {
    const raw = localStorage.getItem(APPLIED_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAppliedInfluencerPromo(promo) {
  if (!promo) localStorage.removeItem(APPLIED_KEY)
  else localStorage.setItem(APPLIED_KEY, JSON.stringify(promo))
  window.dispatchEvent(new Event('sszentronics-promo'))
}

export function useAppliedInfluencerPromo() {
  const [promo, setPromo] = useState(() => getAppliedInfluencerPromo())
  useEffect(() => {
    const sync = () => setPromo(getAppliedInfluencerPromo())
    window.addEventListener('sszentronics-promo', sync)
    return () => window.removeEventListener('sszentronics-promo', sync)
  }, [])
  return promo
}

/** Percentage codes reduce the shown price. A fixed amount is taken once off the cart. */
export function priceAfterInfluencer(price, applied) {
  const amount = Number(price) || 0
  if (!applied || applied.discountType !== 'percentage') return amount
  return Math.max(0, Math.round(amount * (1 - Number(applied.discountValue) / 100)))
}

export function recordInfluencerRedemption(rawCode, rawPhone) {
  const code = String(rawCode || '').trim().toUpperCase()
  const phoneKey = normalizePhone(rawPhone)
  if (!phoneKey) return { ok: false, reason: 'Enter a valid mobile number. Each number can use this code once.' }
  const rows = readAll()
  const index = rows.findIndex((row) => row.code === code)
  if (index === -1) return { ok: false, reason: 'This promo code is not active.' }
  const used = rows[index].redeemedPhones || []
  if (used.includes(phoneKey)) return { ok: false, reason: 'This phone number has already used this code.' }
  rows[index] = {
    ...rows[index],
    timesUsed: (rows[index].timesUsed || 0) + 1,
    redeemedPhones: [...used, phoneKey],
  }
  writeAll(rows)
  const applied = getAppliedInfluencerPromo()
  if (applied?.code === code && applied?.phoneKey === phoneKey) setAppliedInfluencerPromo(null)
  return { ok: true, row: rows[index] }
}

export function describeInfluencerDiscount(row) {
  if (!row) return ''
  if (row.discountType === 'percentage') return `${row.discountValue}% off`
  return `Rs.${Number(row.discountValue).toLocaleString('en-US')} off`
}
