import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_ALL_MIDS,
  HL_PERP_DEXS_MAIN_ONLY,
  HL_SPOT_META,
} from '../test/fixtures.js'
import { installInfoFetchMock } from '../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from './constants.js'
import { hyperliquidProvider } from './HyperliquidProvider.js'

describe('hyperliquidProvider', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('declares type=hyperliquid', () => {
    expect(hyperliquidProvider().type).toBe('hyperliquid')
  })

  it('routes through the default api.hyperliquid.xyz base URL', async () => {
    const mock = installInfoFetchMock({
      perpDexs: HL_PERP_DEXS_MAIN_ONLY,
      spotMeta: HL_SPOT_META,
      allMids: HL_ALL_MIDS,
    })
    restore = mock.restore

    const client = createPerpsClient({
      integrator: 'test',
      apiKey: 'k',
      providers: [hyperliquidProvider()],
    })

    const provider = client.getProvider('hyperliquid')!
    await provider.getPrices(client, {})

    for (const req of mock.requests) {
      expect(req.url.startsWith(`${DEFAULT_HYPERLIQUID_API_URL}/info`)).toBe(
        true
      )
    }
  })

  it('honours a custom apiUrl', async () => {
    const customUrl = 'https://api.hyperliquid-testnet.xyz'
    const mock = installInfoFetchMock({
      perpDexs: HL_PERP_DEXS_MAIN_ONLY,
      spotMeta: HL_SPOT_META,
      allMids: HL_ALL_MIDS,
    })
    restore = mock.restore

    const client = createPerpsClient({
      integrator: 'test',
      apiKey: 'k',
      providers: [hyperliquidProvider({ apiUrl: customUrl })],
    })

    await client.getProvider('hyperliquid')!.getPrices(client, {})

    for (const req of mock.requests) {
      expect(req.url.startsWith(`${customUrl}/info`)).toBe(true)
    }
  })

  it('does not consult client.config.apiUrl for any read call', async () => {
    const mock = installInfoFetchMock({
      perpDexs: HL_PERP_DEXS_MAIN_ONLY,
      spotMeta: HL_SPOT_META,
      allMids: HL_ALL_MIDS,
    })
    restore = mock.restore

    const client = createPerpsClient({
      integrator: 'test',
      apiKey: 'k',
      apiUrl: 'https://lifi.invalid/perps',
      providers: [hyperliquidProvider()],
    })

    await client.getProvider('hyperliquid')!.getPrices(client, {})

    for (const req of mock.requests) {
      expect(req.url.includes('lifi.invalid')).toBe(false)
    }
  })
})
