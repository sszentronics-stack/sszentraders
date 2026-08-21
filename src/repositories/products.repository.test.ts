import { describe, expect, it } from 'vitest'
import { PRODUCT_SELECT } from './products.repository'

// Guards the "public payload redaction" requirement: the public/anon-key
// read path (this repository) must never select cost_price, ledgix_item_id,
// or any other internal-only column, regardless of how many list*/get*
// functions get added on top of the shared select string. RLS is the real
// enforcement layer (supabase/migrations/0014_row_level_security.sql), but
// this is a cheap, fast guard against ever widening this select by mistake.
describe('products.repository field-scoped select', () => {
  const forbidden = ['cost_price', 'ledgix_item_id', 'ledgixItemId', 'select *', 'select(*)']

  it.each(forbidden)('never selects "%s"', (field) => {
    expect(PRODUCT_SELECT).not.toContain(field)
  })

  it('is explicitly field-scoped, not a wildcard', () => {
    expect(PRODUCT_SELECT.trim().startsWith('*')).toBe(false)
  })
})
