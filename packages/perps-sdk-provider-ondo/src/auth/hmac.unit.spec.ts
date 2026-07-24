import { describe, expect, it } from 'vitest'
import { hmacSignRequest } from './hmac.js'

const SECRET = 'test-secret'
const TIMESTAMP_MS = 1_700_000_000_000

describe('hmacSignRequest', () => {
  it('matches the reference HMAC-SHA256 vector for a bodied POST', async () => {
    const signature = await hmacSignRequest(SECRET, {
      timestampMs: TIMESTAMP_MS,
      method: 'POST',
      pathWithQuery: '/v1/perps/orders',
      body: '{"a":1}',
    })

    expect(signature).toBe(
      '9673ce68601cc8750473648c6f2cf5422711fb15204011123d7d92a2c20694b7'
    )
  })

  it('matches the reference vector for a bodyless GET', async () => {
    const signature = await hmacSignRequest(SECRET, {
      timestampMs: TIMESTAMP_MS,
      method: 'GET',
      pathWithQuery: '/v1/perps/positions',
    })

    expect(signature).toBe(
      '563493a9316e2e62607644e5e40e3c92545b3ddf2171025416e7642f95e6b61c'
    )
  })

  it('upper-cases the method before signing', async () => {
    const lower = await hmacSignRequest(SECRET, {
      timestampMs: TIMESTAMP_MS,
      method: 'post',
      pathWithQuery: '/v1/perps/orders',
      body: '{"a":1}',
    })

    expect(lower).toBe(
      '9673ce68601cc8750473648c6f2cf5422711fb15204011123d7d92a2c20694b7'
    )
  })
})
