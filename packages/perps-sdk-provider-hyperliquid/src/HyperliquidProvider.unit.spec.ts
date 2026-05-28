import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HYPERLIQUID_API_URL } from './constants.js'
import { hyperliquidProvider } from './HyperliquidProvider.js'

const ADDRESS = '0x1111111111111111111111111111111111111111'

// Backend asset list the account reads fetch (via core getAssets) for the
// sub-dex fan-out and display fields before issuing the /info calls.
const ASSETS_RESPONSE = {
  assets: [
    {
      assetId: 'BTC',
      market: 'hyperliquid',
      displaySymbol: 'BTC',
      displayQuote: 'USDC',
      logoURI: '',
      szDecimals: 5,
      maxLeverage: 50,
      onlyIsolated: false,
      funding: { rate: '0', nextFundingTime: 0 },
      markPrice: '0',
    },
  ],
}

/**
 * Mock fetch that serves the backend `/assets` route and records every other
 * (HL `/info`) request. HL responses are empty — the account read may reject
 * downstream, but the requests are still captured so we can assert their host.
 */
const installSplitMock = () => {
  const infoRequests: string[] = []
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/assets')) {
        return new Response(JSON.stringify(ASSETS_RESPONSE), { status: 200 })
      }
      infoRequests.push(url)
      void init
      return new Response('{}', { status: 200 })
    })
  return { infoRequests, restore: () => spy.mockRestore() }
}

describe('hyperliquidProvider', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('declares type=hyperliquid', () => {
    expect(hyperliquidProvider().type).toBe('hyperliquid')
  })

  it('routes account-level reads through the default api.hyperliquid.xyz base URL', async () => {
    const mock = installSplitMock()
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

    expect(mock.infoRequests.length).toBeGreaterThan(0)
    for (const url of mock.infoRequests) {
      expect(url.startsWith(`${DEFAULT_HYPERLIQUID_API_URL}/info`)).toBe(true)
    }
  })

  it('honours a custom apiUrl for account-level reads', async () => {
    const customUrl = 'https://api.hyperliquid-testnet.xyz'
    const mock = installSplitMock()
    restore = mock.restore

    const client = createPerpsClient({
      integrator: 'test',
      apiKey: 'k',
      retry: false,
      providers: [hyperliquidProvider({ apiUrl: customUrl })],
    })

    await client
      .getProvider('hyperliquid')!
      .getAccount(client, { address: ADDRESS })
      .catch(() => undefined)

    expect(mock.infoRequests.length).toBeGreaterThan(0)
    for (const url of mock.infoRequests) {
      expect(url.startsWith(`${customUrl}/info`)).toBe(true)
    }
  })
})
