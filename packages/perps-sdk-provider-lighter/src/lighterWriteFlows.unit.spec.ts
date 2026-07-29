import {
  createMemoryStorage,
  createPerpsClient,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import {
  ActionType,
  type PerpsProviderPlugin,
  SigningMethod,
  type WasmBlobActionStep,
} from '@lifi/perps-types'
import { type Address, createWalletClient, custom } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LIGHTER_MAINNET_DEPLOYMENT,
  LIGHTER_PROVIDER_KEY,
  LIGHTER_RH_DEPLOYMENT,
  LIGHTER_RH_PROVIDER_KEY,
} from './constants.js'
import { lighterProvider, lighterRhProvider } from './LighterProvider.js'

// No WASM mock here: these flows drive the real Go signer shipped with the
// package through a real `PerpsClient`, so a broken loader, a wrong signing
// chain id, or a missing provider-owned dependency fails the test.

const USER = privateKeyToAccount(`0x${'7f'.repeat(32)}`)
const ADDRESS = USER.address
const ACCOUNT_INDEX = 42

const respond = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const ACCOUNT_PAYLOAD = {
  code: 200,
  total: 1,
  accounts: [
    {
      code: 0,
      account_type: 1,
      index: ACCOUNT_INDEX,
      l1_address: ADDRESS,
      account_index: ACCOUNT_INDEX,
      collateral: '500',
      available_balance: '100',
      status: 1,
      positions: [],
      assets: [],
      total_asset_value: '500',
      cross_asset_value: '500',
      cross_initial_margin_requirement: '0',
      cancel_all_time: 0,
      total_order_count: 0,
      total_isolated_order_count: 0,
      pending_order_count: 0,
      transaction_time: 0,
      account_trading_mode: 1,
      name: 'test',
      description: '',
    },
  ],
}

/** The user's wallet — signs the EIP-191 message REGISTER_API_KEY requires. */
const userWallet = createWalletClient({
  account: USER,
  chain: arbitrum,
  transport: custom({
    async request() {
      return null
    },
  }),
})

const registerApiKeyStep: WasmBlobActionStep = {
  action: ActionType.REGISTER_API_KEY,
  wasmSignParams: { kind: 'changePubKey', nonce: 0, api_key_index: 42 },
}

const createOrderStep: WasmBlobActionStep = {
  action: ActionType.PLACE_ORDER,
  wasmSignParams: {
    kind: 'createOrder',
    market_index: 0,
    client_order_index: 1,
    base_amount: 1000,
    price: 5_000_000,
    is_ask: 0,
    order_type: 0,
    // -1 is lighter-go's "no expiry" sentinel for a non-expiring order.
    order_expiry: -1,
    time_in_force: 1,
    reduce_only: 0,
    trigger_price: 0,
    nonce: 1,
  },
}

/** Bind the plugin to a real client so registry/retry/fetch wiring is exercised. */
const clientFor = (provider: PerpsProviderPlugin) =>
  createPerpsClient({
    integrator: 'ord-1134-test',
    apiKey: 'test-key',
    providers: [provider],
    userWallet,
  })

describe.each([
  {
    label: 'lighterProvider()',
    factory: lighterProvider,
    deployment: LIGHTER_MAINNET_DEPLOYMENT,
    providerKey: LIGHTER_PROVIDER_KEY,
  },
  {
    label: 'lighterRhProvider()',
    factory: lighterRhProvider,
    deployment: LIGHTER_RH_DEPLOYMENT,
    providerKey: LIGHTER_RH_PROVIDER_KEY,
  },
])('$label — WASM writes with no injected dependencies', ({
  factory,
  deployment,
  providerKey,
}) => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/api/v1/account')) {
          return respond(ACCOUNT_PAYLOAD)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reaches REGISTER_API_KEY and a WASM-backed write off the bare factory', async () => {
    const storage = createMemoryStorage()
    const provider = factory({ storage })
    const client = clientFor(provider)

    const [registered] = await provider.signActions!(
      SigningMethod.WASM_BLOB,
      [registerApiKeyStep],
      ADDRESS as Address,
      { userWallet }
    )

    expect(registered.action).toBe(ActionType.REGISTER_API_KEY)
    const signedRegistration = registered as {
      signedTx: { txType: number; txInfo: string; txHash: string }
      wasmSignParams: { new_public_key?: string }
    }
    // The Go signer produced a real ChangePubKey blob with the user's L1
    // signature embedded, for this account and API-key slot.
    const txInfo = JSON.parse(signedRegistration.signedTx.txInfo)
    expect(txInfo.AccountIndex).toBe(ACCOUNT_INDEX)
    expect(txInfo.ApiKeyIndex).toBe(42)
    expect(txInfo.L1Sig).toMatch(/^0x[0-9a-f]{130}$/i)
    expect(signedRegistration.wasmSignParams.new_public_key).toMatch(
      /^0x[0-9a-f]+$/i
    )
    expect(signedRegistration.signedTx.txHash).toMatch(/^[0-9a-f]{80}$/)

    // The generated keypair landed in the instance's own provider-namespaced
    // store, so the follow-up write signs without re-registering.
    const storageKey =
      providerKey === LIGHTER_PROVIDER_KEY
        ? `lifi-perps-lighter-key:${ADDRESS.toLowerCase()}`
        : `lifi-perps-lighter-key:${providerKey}:${ADDRESS.toLowerCase()}`
    const stored = await storage.get(storageKey)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored as string)).toMatchObject({
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: 42,
    })

    const [order] = await provider.signActions!(
      SigningMethod.WASM_BLOB,
      [createOrderStep],
      ADDRESS as Address
    )
    const signedOrder = order as {
      signedTx: { txType: number; txInfo: string; txHash: string }
    }
    const orderTxInfo = JSON.parse(signedOrder.signedTx.txInfo)
    expect(orderTxInfo.AccountIndex).toBe(ACCOUNT_INDEX)
    expect(orderTxInfo.Sig).toMatch(/\S/)
    expect(signedOrder.signedTx.txHash).toMatch(/^[0-9a-f]{80}$/)

    // The plugin registered under its deployment key and resolves links
    // against that deployment's explorer (RH publishes none).
    expect(client.getProvider(providerKey)?.type).toBe(providerKey)
    expect(provider.resolveExplorerLink?.(signedOrder.signedTx.txHash)).toBe(
      deployment.explorerTxBaseUrl
        ? `${deployment.explorerTxBaseUrl}${signedOrder.signedTx.txHash}`
        : undefined
    )
  })
})

describe('lighterProvider() — custom generic storage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/api/v1/account')) {
          return respond(ACCOUNT_PAYLOAD)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists the provider-owned API key through a caller-supplied adapter', async () => {
    const backing = new Map<string, string>()
    const writes: string[] = []
    const storage: StorageAdapter = {
      get: async (key) => backing.get(key) ?? null,
      set: async (key, value) => {
        writes.push(key)
        backing.set(key, value)
      },
      remove: async (key) => {
        backing.delete(key)
      },
    }

    const provider = lighterProvider({ storage })
    clientFor(provider)
    await provider.signActions!(
      SigningMethod.WASM_BLOB,
      [registerApiKeyStep],
      ADDRESS as Address,
      { userWallet }
    )

    expect(writes).toEqual([`lifi-perps-lighter-key:${ADDRESS.toLowerCase()}`])
    expect(
      JSON.parse(backing.get(writes[0]) as string).apiKeyPrivateKey
    ).toMatch(/^0x[0-9a-f]+$/i)
  })
})
