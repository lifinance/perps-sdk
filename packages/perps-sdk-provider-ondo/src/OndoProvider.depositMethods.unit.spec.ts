import { createMemoryStorage, type PerpsSDKClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OndoTokenStore } from './auth/OndoTokenStore.js'
import { ondoProvider } from './OndoProvider.js'
import type { OndoAuthToken } from './types/auth.js'

const ADDRESS = '0x1111111111111111111111111111111111111111' as const
const RECIPIENT = '0x2222222222222222222222222222222222222222' as const
const API_URL = 'https://api.ondoperps-sandbox.xyz'
const AUTH_TOKEN: OndoAuthToken = {
  identifier: ADDRESS,
  authType: 'erc4361',
  accountId: 'acct-1',
  issuedAtSecs: 1_700_000_000,
  expirationSecs: 1_900_000_000,
  token: 'ondo-jwt-token',
  newAccount: false,
}
const ETHEREUM_USDC = {
  chainId: 1,
  address: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const,
  symbol: 'USDC',
  decimals: 6,
}
const ARBITRUM_USDC = {
  chainId: 42161,
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
  symbol: 'USDC',
  decimals: 6,
}

const response = (result: unknown): Response =>
  new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

afterEach(() => vi.unstubAllGlobals())

describe('ondoProvider.getDepositMethods', () => {
  it('blocks discovery without a provisioned deposit address', async () => {
    const storage = createMemoryStorage()
    await new OndoTokenStore(storage, API_URL).set(ADDRESS, AUTH_TOKEN)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({}))
    )
    const provider = ondoProvider({ apiUrl: API_URL, storage })
    provider.bind({
      config: { apiUrl: 'https://backend.test' },
    } as PerpsSDKClient)

    await expect(
      provider.getDepositMethods!({
        address: ADDRESS,
        sourceAsset: ARBITRUM_USDC,
      })
    ).resolves.toEqual([])
  })

  it('returns a raw Ethereum USDC transfer with recipient and gas requirement', async () => {
    const storage = createMemoryStorage()
    await new OndoTokenStore(storage, API_URL).set(ADDRESS, AUTH_TOKEN)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ depositAddress: RECIPIENT }))
    )
    const provider = ondoProvider({ apiUrl: API_URL, storage })
    provider.bind({
      config: { apiUrl: 'https://backend.test' },
    } as PerpsSDKClient)

    const [method] = await provider.getDepositMethods!({
      address: ADDRESS,
      sourceAsset: ETHEREUM_USDC,
    })

    expect(method).toMatchObject({
      kind: 'rawTransfer',
      destinationAsset: ETHEREUM_USDC,
      recipient: RECIPIENT,
      prerequisites: [expect.objectContaining({ kind: 'gas' })],
    })
  })

  it('returns a LI.FI route to Ethereum USDC for other source assets', async () => {
    const storage = createMemoryStorage()
    await new OndoTokenStore(storage, API_URL).set(ADDRESS, AUTH_TOKEN)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ deposit_address: RECIPIENT }))
    )
    const provider = ondoProvider({ apiUrl: API_URL, storage })
    provider.bind({
      config: { apiUrl: 'https://backend.test' },
    } as PerpsSDKClient)

    const [method] = await provider.getDepositMethods!({
      address: ADDRESS,
      sourceAsset: ARBITRUM_USDC,
    })

    expect(method).toMatchObject({
      kind: 'lifiRoute',
      sourceAsset: ARBITRUM_USDC,
      destinationAsset: ETHEREUM_USDC,
      recipient: RECIPIENT,
    })
  })
})
