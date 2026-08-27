import type { ReferralStatus } from '@lifi/perps-types'
import { PerpsErrorCode, ReferralCodeRejection } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { PerpsError } from '../errors/PerpsError.js'
import { getReferralStatus } from './getReferralStatus.js'

const ADDRESS = '0x1111111111111111111111111111111111111111' as const

const client = createPerpsClient({
  integrator: 'test-app',
  apiKey: 'test-key',
  retry: false,
})

const emptyStatus: ReferralStatus = {
  address: ADDRESS,
  termsVersion: 'v3',
  termsAccepted: false,
  ownedCodeEligibility: { eligible: false },
}

describe('getReferralStatus', () => {
  it('passes the address and candidate code as query params to GET /meta/referral', async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json(emptyStatus)
      })
    )

    await getReferralStatus(client, { address: ADDRESS, code: 'ABC123' })

    expect(params?.get('address')).toBe(ADDRESS)
    expect(params?.get('code')).toBe('ABC123')
  })

  it('omits the code param when no candidate is supplied', async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json(emptyStatus)
      })
    )

    await getReferralStatus(client, { address: ADDRESS })

    expect(params?.has('code')).toBe(false)
  })

  it('relays a Terms-only onboarding requirement', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral`, () =>
        HttpResponse.json({
          ...emptyStatus,
          onboarding: { termsVersion: 'v3' },
        } satisfies ReferralStatus)
      )
    )

    const status = await getReferralStatus(client, { address: ADDRESS })

    expect(status.onboarding).toEqual({ termsVersion: 'v3' })
    expect(status.onboarding?.referralCode).toBeUndefined()
  })

  it('relays a referral-only onboarding requirement for an address that already accepted', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral`, () =>
        HttpResponse.json({
          ...emptyStatus,
          termsAccepted: true,
          candidate: {
            code: 'abc123',
            valid: true,
            normalizedCode: 'ABC123',
          },
          onboarding: { referralCode: 'ABC123' },
        } satisfies ReferralStatus)
      )
    )

    const status = await getReferralStatus(client, {
      address: ADDRESS,
      code: 'abc123',
    })

    expect(status.termsAccepted).toBe(true)
    expect(status.onboarding).toEqual({ referralCode: 'ABC123' })
    expect(status.onboarding?.termsVersion).toBeUndefined()
  })

  it('relays a combined onboarding requirement carrying both terms and a code', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral`, () =>
        HttpResponse.json({
          ...emptyStatus,
          candidate: {
            code: 'ABC123',
            valid: true,
            normalizedCode: 'ABC123',
          },
          onboarding: { termsVersion: 'v3', referralCode: 'ABC123' },
        } satisfies ReferralStatus)
      )
    )

    const status = await getReferralStatus(client, {
      address: ADDRESS,
      code: 'ABC123',
    })

    expect(status.onboarding).toEqual({
      termsVersion: 'v3',
      referralCode: 'ABC123',
    })
  })

  it('relays the backend rejection for an invalid candidate code', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral`, () =>
        HttpResponse.json({
          ...emptyStatus,
          candidate: {
            code: 'nope!',
            valid: false,
            rejection: ReferralCodeRejection.MALFORMED,
          },
          onboarding: { termsVersion: 'v3' },
        } satisfies ReferralStatus)
      )
    )

    const status = await getReferralStatus(client, {
      address: ADDRESS,
      code: 'nope!',
    })

    expect(status.candidate?.valid).toBe(false)
    expect(status.candidate?.rejection).toBe(ReferralCodeRejection.MALFORMED)
    expect(status.candidate?.normalizedCode).toBeUndefined()
    // The invalid candidate does not enter the step the address must sign.
    expect(status.onboarding?.referralCode).toBeUndefined()
  })

  it('relays no onboarding requirement when the backend needs no consent', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral`, () =>
        HttpResponse.json({
          ...emptyStatus,
          termsAccepted: true,
          attachedCode: { code: 'ABC123', attachedAt: 1_735_689_600_000 },
        } satisfies ReferralStatus)
      )
    )

    const status = await getReferralStatus(client, { address: ADDRESS })

    expect(status.onboarding).toBeUndefined()
  })

  it('relays a well-formed empty payload for an address with no recorded state', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral`, () =>
        HttpResponse.json(emptyStatus)
      )
    )

    const status = await getReferralStatus(client, { address: ADDRESS })

    expect(status).toEqual(emptyStatus)
    expect(status.attachedCode).toBeUndefined()
    expect(status.ownedCode).toBeUndefined()
    expect(status.ownedCodeEligibility.eligible).toBe(false)
  })

  it('propagates a backend error as a typed PerpsError', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral`, () =>
        HttpResponse.json(
          {
            code: PerpsErrorCode.ValidationError,
            message: 'invalid address',
            tool: 'lifi',
          },
          { status: 400 }
        )
      )
    )

    const error = await getReferralStatus(client, { address: ADDRESS }).catch(
      (e) => e
    )

    expect(error).toBeInstanceOf(PerpsError)
    expect(error.code).toBe(PerpsErrorCode.ValidationError)
    expect(error.message).toBe('invalid address')
  })

  it('supports AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getReferralStatus(
        client,
        { address: ADDRESS },
        { signal: controller.signal }
      )
    ).rejects.toThrow()
  })
})
