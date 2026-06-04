import { createMemoryStorage, createPerpsClient } from '@lifi/perps-sdk'
import type { Eip712ActionStep } from '@lifi/perps-types'
import { ActionType, PerpsSigner, SigningMethod } from '@lifi/perps-types'
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
      .getAccount({ address: ADDRESS })
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
      .getAccount({ address: ADDRESS })
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

    it('resolveActionRequest provisions APPROVE_AGENT and injects the agent address as a param', async () => {
      const provider = hyperliquidProvider({ storage: createMemoryStorage() })

      const contribution = await provider.resolveActionRequest!(
        ActionType.APPROVE_AGENT,
        ADDRESS,
        [PerpsSigner.USER]
      )
      // APPROVE_AGENT is user-signed: agent rides as a param, not signerAddress.
      expect(contribution.signerAddress).toBeUndefined()
      const agentAddress = contribution.params?.agentAddress as string
      expect(agentAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)

      // The provisioned agent is stable and surfaced via the lifecycle methods.
      expect(await provider.getAgentAddress(ADDRESS)).toBe(agentAddress)
      expect(await provider.hasAgent(ADDRESS)).toBe(true)

      // An agent-signed action carries the same agent as signerAddress.
      const place = await provider.resolveActionRequest!(
        ActionType.PLACE_ORDER,
        ADDRESS,
        [PerpsSigner.AGENT]
      )
      expect(place.signerAddress).toBe(agentAddress)
    })

    it('resolveActionRequest throws for an agent-signed action when no agent exists', async () => {
      const provider = hyperliquidProvider({ storage: createMemoryStorage() })
      await expect(
        provider.resolveActionRequest!(ActionType.PLACE_ORDER, ADDRESS, [
          PerpsSigner.AGENT,
        ])
      ).rejects.toThrow()
    })

    it('signActions signs the EIP712 agent arm and removeAgent revokes it', async () => {
      const provider = hyperliquidProvider({ storage: createMemoryStorage() })
      // Provision the agent via the user-signed APPROVE_AGENT path.
      await provider.resolveActionRequest!(ActionType.APPROVE_AGENT, ADDRESS, [
        PerpsSigner.USER,
      ])

      const [signed] = await provider.signActions!(
        SigningMethod.EIP712,
        [eip712Step()],
        ADDRESS,
        { signers: [PerpsSigner.AGENT] }
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
