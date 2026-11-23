import { describe, expect, it } from 'vitest'
import { createFetchMock, okAnswer } from '../../test/fetchMock.js'
import { ExtendedApiClient } from './apiClient.js'

const L1_HEADERS = {
  L1_SIGNATURE: 'abc',
  L1_MESSAGE_TIME: '2026-11-23T12:00:00Z',
}

describe('ExtendedApiClient headers', () => {
  it('sends the L1 headers under their Extended names without a proxy', async () => {
    const { fetchImpl, requests } = createFetchMock([okAnswer({})])
    const client = new ExtendedApiClient('https://venue.test', { fetchImpl })

    await client.send('POST', '/api/v1/user/account/api-key', {
      headers: L1_HEADERS,
    })

    expect(requests[0]!.headers).toMatchObject({
      l1_signature: 'abc',
      l1_message_time: '2026-11-23T12:00:00Z',
    })
  })

  it('renames the L1 headers without an underscore through a proxy', async () => {
    const { fetchImpl, requests } = createFetchMock([okAnswer({})])
    const client = new ExtendedApiClient('https://api.test/extended', {
      fetchImpl,
      proxied: true,
    })

    await client.send('POST', '/api/v1/user/account/api-key', {
      headers: L1_HEADERS,
      apiKey: 'key',
    })

    const { headers } = requests[0]!
    expect(headers).toMatchObject({
      'x-l1-signature': 'abc',
      'x-l1-message-time': '2026-11-23T12:00:00Z',
      'x-api-key': 'key',
    })
    expect(Object.keys(headers).some((name) => name.includes('_'))).toBe(false)
  })
})
