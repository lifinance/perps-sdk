import { createMemoryStorage, createPerpsClient } from '@lifi/perps-sdk'
import type { Eip712ActionStep } from '@lifi/perps-types'
import { ActionType, SigningMethod } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HYPERLIQUID_API_URL } from './constants.js'
import { hyperliquidProvider } from './HyperliquidProvider.js'

const ADDRESS = '0x1111111111111111111111111111111111111111'

// Backend asset list the account reads fetch (via core getAssets) for the
// sub-dex fan-out and display fields before issuing the /info calls.
const MARKETS_RESPONSE = {
  markets: [
    {
      providerId: 'hyperliquid',
      id: 'BTC',
      categoryId: 'hyperliquid',
      baseAsset: {
        providerId: 'hyperliquid',
        id: 'BTC',
        displaySymbol: 'BTC',
        logoURI: '',
      },
      quoteAsset: {
        providerId: 'hyperliquid',
        id: 'USDC',
        displaySymbol: 'USDC',
        logoURI: '',
      },
      szDecimals: 5,
      markPrice: '0',
      maxLeverage: 50,
      onlyIsolated: false,
      funding: { rate: '0', nextFundingTime: 0 },
    },
  ],
}

/**
 * Mock fetch that serves the backend `/markets` route and records every other
 * (HL `/info`) request. HL responses are empty — the account read may reject
 * downstream, but the requests are still captured so we can assert their host.
 */
const installSplitMock = () => {
  const infoRequests: string[] = []
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/markets')) {
        return new Response(JSON.stringify(MARKETS_RESPONSE), { status: 200 })
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

  describe('agent session ownership', () => {
    const eip712Step = (): Eip712ActionStep => ({
      action: ActionType.PLACE_ORDER,
      typedData: {
        domain: { name: 'HL', chainId: 1 },
        types: { Agent: [{ name: 'who', type: 'address' }] },
        primaryType: 'Agent',
        message: { who: '0x0000000000000000000000000000000000000000' },
      },
    })

    it('resolveSignerAddress creates and returns a stable agent address', async () => {
      const provider = hyperliquidProvider({ storage: createMemoryStorage() })

      const created = await provider.resolveSignerAddress!(ADDRESS, {
        create: true,
      })
      expect(created).toMatch(/^0x[a-fA-F0-9]{40}$/)

      // Subsequent resolves return the same agent without re-creating.
      expect(await provider.resolveSignerAddress!(ADDRESS)).toBe(created)
      expect(await provider.getAgentAddress(ADDRESS)).toBe(created)
      expect(await provider.hasAgent(ADDRESS)).toBe(true)
    })

    it('resolveSignerAddress throws without create when no agent exists', async () => {
      const provider = hyperliquidProvider({ storage: createMemoryStorage() })
      await expect(provider.resolveSignerAddress!(ADDRESS)).rejects.toThrow()
    })

    it('signActions signs the EIP712 agent arm and removeAgent revokes it', async () => {
      const provider = hyperliquidProvider({ storage: createMemoryStorage() })
      await provider.resolveSignerAddress!(ADDRESS, { create: true })

      const [signed] = await provider.signActions!(
        SigningMethod.EIP712,
        [eip712Step()],
        ADDRESS
      )
      expect(signed.action).toBe(ActionType.PLACE_ORDER)
      expect('signature' in signed && signed.signature).toMatch(
        /^0x[0-9a-f]+$/i
      )

      await provider.removeAgent(ADDRESS)
      expect(await provider.hasAgent(ADDRESS)).toBe(false)
    })
  })
})
