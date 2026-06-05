import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  mockTermsAccepted,
  mockTermsNotAccepted,
  server,
} from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getTermsAcceptance } from './getTermsAcceptance.js'

const ACCEPTED_ADDRESS = '0x1111111111111111111111111111111111111111' as const
const UNACCEPTED_ADDRESS = '0x2222222222222222222222222222222222222222' as const

const client = createPerpsClient({
  integrator: 'test-app',
  apiKey: 'test-key',
  retry: false,
})

describe('getTermsAcceptance', () => {
  it('passes the address as a query param to GET /meta/terms', async () => {
    let queriedAddress: string | null = null
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/terms`, ({ request }) => {
        queriedAddress = new URL(request.url).searchParams.get('address')
        return HttpResponse.json(mockTermsNotAccepted)
      })
    )

    await getTermsAcceptance(client, UNACCEPTED_ADDRESS)

    expect(queriedAddress).toBe(UNACCEPTED_ADDRESS)
  })

  it('returns the current terms with content when the address has accepted', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/terms`, () =>
        HttpResponse.json(mockTermsAccepted)
      )
    )

    const result = await getTermsAcceptance(client, ACCEPTED_ADDRESS)

    expect(result).toEqual(mockTermsAccepted)
    expect(result.accepted).toBe(true)
    expect(result.acceptedAt).toBe(1735689600000)
    expect(result.content).toContain('Terms of Service')
  })

  it('returns the current terms with content when the address has not accepted', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/meta/terms`, () =>
        HttpResponse.json(mockTermsNotAccepted)
      )
    )

    const result = await getTermsAcceptance(client, UNACCEPTED_ADDRESS)

    expect(result).toEqual(mockTermsNotAccepted)
    expect(result.accepted).toBe(false)
    expect(result.acceptedAt).toBeUndefined()
    expect(result.content).toContain('Terms of Service')
  })

  it('supports AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getTermsAcceptance(client, ACCEPTED_ADDRESS, {
        signal: controller.signal,
      })
    ).rejects.toThrow()
  })
})
