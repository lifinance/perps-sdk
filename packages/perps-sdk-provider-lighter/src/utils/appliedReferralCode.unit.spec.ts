import { describe, expect, it } from 'vitest'
import { LighterApiClient } from './apiClient.js'
import { fetchAppliedReferralCode } from './appliedReferralCode.js'

const ADDRESS = '0x1111111111111111111111111111111111111ABC' as const
const AUTH_TOKEN = 'lighter-auth-token'

const clientWith = (fetchImpl: typeof fetch): LighterApiClient =>
  new LighterApiClient('https://lighter.test', {
    fetchImpl,
    policy: {
      enabled: false,
      maxAttempts: 1,
      baseDelayMs: 0,
      maxDelayMs: 0,
      respectRetryAfter: false,
      classify: () => 'fail',
    },
  })

describe('fetchAppliedReferralCode', () => {
  it('queries userReferrals with the lowercased address and the auth token', async () => {
    const urls: string[] = []
    const client = clientWith(async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ code: 200, used_code: 'LIFI' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    await expect(
      fetchAppliedReferralCode(client, ADDRESS, AUTH_TOKEN)
    ).resolves.toBe('LIFI')

    expect(urls).toHaveLength(1)
    const url = new URL(urls[0])
    expect(url.pathname).toBe('/api/v1/referral/userReferrals')
    expect(url.searchParams.get('l1_address')).toBe(ADDRESS.toLowerCase())
    expect(url.searchParams.get('auth')).toBe(AUTH_TOKEN)
  })

  it('returns the empty used_code verbatim when no referral is applied', async () => {
    const client = clientWith(async () => {
      return new Response(JSON.stringify({ code: 200, used_code: '' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    await expect(
      fetchAppliedReferralCode(client, ADDRESS, AUTH_TOKEN)
    ).resolves.toBe('')
  })

  it('lets a non-2xx response propagate as an error', async () => {
    const client = clientWith(async () => {
      return new Response(JSON.stringify({ code: 500, message: 'down' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    })

    await expect(
      fetchAppliedReferralCode(client, ADDRESS, AUTH_TOKEN)
    ).rejects.toThrow()
  })
})
