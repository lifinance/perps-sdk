import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { installInfoFetchMock } from '../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from './constants.js'
import { hyperliquidProvider } from './HyperliquidProvider.js'

const ADDRESS = '0x1111111111111111111111111111111111111111'

describe('hyperliquidProvider', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('declares type=hyperliquid', () => {
    expect(hyperliquidProvider().type).toBe('hyperliquid')
  })

  it('routes account-level reads through the default api.hyperliquid.xyz base URL', async () => {
    const mock = installInfoFetchMock({})
    restore = mock.restore

    const client = createPerpsClient({
      integrator: 'test',
      apiKey: 'k',
      retry: false,
      providers: [hyperliquidProvider()],
    })

    await client
      .getProvider('hyperliquid')!
      .getAccount(client, { address: ADDRESS })
      .catch(() => undefined)

    for (const req of mock.requests) {
      expect(req.url.startsWith(`${DEFAULT_HYPERLIQUID_API_URL}/info`)).toBe(
        true
      )
    }
  })

  it('honours a custom apiUrl for account-level reads', async () => {
    const customUrl = 'https://api.hyperliquid-testnet.xyz'
    const mock = installInfoFetchMock({})
    restore = mock.restore

    const client = createPerpsClient({
      integrator: 'test',
      apiKey: 'k',
      providers: [hyperliquidProvider({ apiUrl: customUrl })],
    })

    await client
      .getProvider('hyperliquid')!
      .getAccount(client, { address: ADDRESS })
      .catch(() => undefined)

    for (const req of mock.requests) {
      expect(req.url.startsWith(`${customUrl}/info`)).toBe(true)
    }
  })
})
