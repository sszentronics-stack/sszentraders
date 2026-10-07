import { describe, expect, it } from 'vitest'
import { authHeadersFromSession } from './functions'

describe('authHeadersFromSession', () => {
  it('adds the user JWT so Edge Functions see an Authorization header', () => {
    expect(authHeadersFromSession({ access_token: 'user-jwt' }, { 'x-idempotency-key': 'abc' })).toEqual({
      'x-idempotency-key': 'abc',
      Authorization: 'Bearer user-jwt',
    })
  })

  it('does not invent a header when there is no session', () => {
    expect(authHeadersFromSession(null, { 'x-idempotency-key': 'abc' })).toEqual({
      'x-idempotency-key': 'abc',
    })
  })
})
