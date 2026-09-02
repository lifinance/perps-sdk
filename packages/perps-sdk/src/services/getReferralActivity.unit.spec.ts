import type { ReferralActivityResponse } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { PerpsError } from '../errors/PerpsError.js'
import { getReferralActivity } from './getReferralActivity.js'

const ADDRESS = '0x1111111111111111111111111111111111111111' as const
const ATTACHED = '0x2222222222222222222222222222222222222222' as const

const client = createPerpsClient({
  integrator: 'test-app',
  apiKey: 'test-key',
  retry: false,
})

const emptyActivity: ReferralActivityResponse = {
  items: [],
  pagination: { limit: 0, hasMore: false },
}

describe('getReferralActivity', () => {
  it('passes address, limit, and cursor as query params to GET /meta/referral/activity', async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral/activity`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json(emptyActivity)
      })
    )

    await getReferralActivity(client, {
      address: ADDRESS,
      limit: 50,
      cursor: 'abc',
    })

    expect(params?.get('address')).toBe(ADDRESS)
    expect(params?.get('limit')).toBe('50')
    expect(params?.get('cursor')).toBe('abc')
  })

  it('omits limit and cursor when they are not supplied', async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral/activity`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json(emptyActivity)
      })
    )

    await getReferralActivity(client, { address: ADDRESS })

    expect(params?.has('limit')).toBe(false)
    expect(params?.has('cursor')).toBe(false)
  })

  it('relays the attachment records with their pagination cursor', async () => {
    const response: ReferralActivityResponse = {
      items: [
        {
          address: ATTACHED,
          attachedAt: 1_735_689_600_000,
          notional: '12500.5',
        },
      ],
      pagination: { limit: 1, hasMore: true, cursor: 'next' },
    }
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral/activity`, () =>
        HttpResponse.json(response)
      )
    )

    const activity = await getReferralActivity(client, {
      address: ADDRESS,
      limit: 1,
    })

    expect(activity).toEqual(response)
  })

  it('relays an empty page for an address that owns no code', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral/activity`, () =>
        HttpResponse.json(emptyActivity)
      )
    )

    const activity = await getReferralActivity(client, { address: ADDRESS })

    expect(activity.items).toEqual([])
    expect(activity.pagination.hasMore).toBe(false)
    expect(activity.pagination.cursor).toBeUndefined()
  })

  it('propagates a backend error as a typed PerpsError', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/referral/activity`, () =>
        HttpResponse.json(
          {
            code: PerpsErrorCode.Unauthorized,
            message: 'missing api key',
            tool: 'lifi',
          },
          { status: 401 }
        )
      )
    )

    const error = await getReferralActivity(client, { address: ADDRESS }).catch(
      (e) => e
    )

    expect(error).toBeInstanceOf(PerpsError)
    expect(error.code).toBe(PerpsErrorCode.Unauthorized)
    expect(error.message).toBe('missing api key')
  })

  it('supports AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getReferralActivity(
        client,
        { address: ADDRESS },
        { signal: controller.signal }
      )
    ).rejects.toThrow()
  })
})
