import { createMemoryStorage, PerpsError } from '@lifi/perps-sdk'
import type {
  HmacActionStep,
  HmacSignedActionStep,
  SessionActionStep,
  SiweActionStep,
  SiweSignedActionStep,
  WasmBlobActionStep,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode, SigningMethod } from '@lifi/perps-types'
import { createWalletClient, http, verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import type { OndoApiKey, OndoAuthToken } from '../types/auth.js'
import type { OndoCreatedApiKey } from '../types/wire.js'
import {
  OndoApiClient,
  OndoApiError,
  OndoSessionExpiredError,
} from '../utils/apiClient.js'
import { hmacSignRequest } from './hmac.js'
import { OndoApiKeyStore } from './OndoApiKeyStore.js'
import { OndoTokenStore } from './OndoTokenStore.js'
import { ondoSignActions } from './signActions.js'

const BASE_URL = 'https://api.ondoperps-sandbox.xyz'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
)
const userWallet = createWalletClient({
  account,
  chain: mainnet,
  transport: http('http://localhost'),
})

const nowSecs = () => Math.floor(Date.now() / 1000)

const tokenFixture = (overrides?: Partial<OndoAuthToken>): OndoAuthToken => ({
  identifier: account.address.toLowerCase(),
  authType: 'erc4361',
  accountId: 'acct-1',
  issuedAtSecs: nowSecs() - 60,
  expirationSecs: nowSecs() + 3600,
  token: 'ondo-jwt-token',
  ...overrides,
})

const apiKeyFixture = (overrides?: Partial<OndoApiKey>): OndoApiKey => ({
  keyId: 'key-1',
  apiSecret: 'super-secret',
  name: 'lifi-perps',
  createdAt: '2026-07-14T00:00:00.000Z',
  scopes: ['trade'],
  ...overrides,
})

// The real `POST /v1/api_keys` result: the HMAC secret arrives as `secretKey`,
// not `apiSecret`. Captured live 2026-07-15.
const createdApiKeyFixture = (
  overrides?: Partial<OndoCreatedApiKey>
): OndoCreatedApiKey => ({
  keyId: 'ondoKeyId_abc',
  name: 'lifi-perps',
  createdAt: '2026-07-15T12:31:55.781433839Z',
  scopes: ['trade'],
  secretKey: 'ondoApiSecret_xyz',
  ...overrides,
})

const SIWE_MESSAGE = [
  'ondoperps.xyz wants you to sign in with your Ethereum account:',
  account.address,
  '',
  'Sign in to Ondo Perps',
  '',
  'URI: https://ondoperps.xyz',
  'Version: 1',
  'Chain ID: 1',
  'Nonce: 8ee9befj3',
  'Issued At: 2026-07-03T00:00:00.000Z',
].join('\n')

const SIWE_STEP: SiweActionStep = {
  action: ActionType.SIWE_LOGIN,
  siwe: { challengeId: 'challenge-1', message: SIWE_MESSAGE },
}

const TERMS_STEP: SessionActionStep = {
  action: ActionType.ACCEPT_PROVIDER_TERMS,
  session: {},
}

const REGISTER_KEY_STEP: SessionActionStep = {
  action: ActionType.REGISTER_API_KEY,
  session: {},
}

const CREATE_DEPOSIT_STEP: SessionActionStep = {
  action: ActionType.CREATE_DEPOSIT_ADDRESS,
  session: {
    network: 'ethereum',
    symbol: 'USDC',
    depositDestination: { wallet: 'margin' },
  },
}

const PLACE_ORDER_STEP: HmacActionStep = {
  action: ActionType.PLACE_ORDER,
  request: {
    method: 'POST',
    path: '/v1/perps/orders',
    body: '{"market":"AAPL-USD.P","side":"buy","size":"1","type":"market"}',
  },
}

const REFERRAL_SESSION_STEP: HmacActionStep = {
  action: ActionType.SET_REFERRAL,
  request: {
    method: 'POST',
    path: '/v1/account/referral',
    body: '{"code":"LIFI"}',
  },
}

const WASM_STEP: WasmBlobActionStep = {
  action: ActionType.REGISTER_API_KEY,
  wasmSignParams: {},
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const makeDeps = (fetchImpl: typeof fetch) => ({
  client: new OndoApiClient(BASE_URL, { fetchImpl }),
  tokenStore: new OndoTokenStore(createMemoryStorage(), BASE_URL),
  apiKeyStore: new OndoApiKeyStore(createMemoryStorage(), BASE_URL),
})

describe('ondoSignActions — SIWE', () => {
  it('signs the challenge, persists the session token, and returns the signed step', async () => {
    const token = tokenFixture()
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: token }))
    const deps = makeDeps(fetchImpl)

    const signed = await ondoSignActions(
      deps,
      SigningMethod.SIWE,
      [SIWE_STEP],
      account.address,
      { userWallet }
    )

    const step = signed[0] as SiweSignedActionStep
    expect(step.action).toBe(ActionType.SIWE_LOGIN)
    expect(step.siwe).toEqual(SIWE_STEP.siwe)
    await expect(
      verifyMessage({
        address: account.address,
        message: SIWE_MESSAGE,
        signature: step.signature,
      })
    ).resolves.toBe(true)

    await expect(deps.tokenStore.get(account.address)).resolves.toEqual(token)
  })

  it('performs only the login call — terms are a separate step', async () => {
    const token = tokenFixture()
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: token }))
    const deps = makeDeps(fetchImpl)

    await ondoSignActions(
      deps,
      SigningMethod.SIWE,
      [SIWE_STEP],
      account.address,
      { userWallet }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await expect(deps.tokenStore.get(account.address)).resolves.toEqual(token)
  })

  it('throws SDKError when no user wallet is available', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())

    const promise = ondoSignActions(
      deps,
      SigningMethod.SIWE,
      [SIWE_STEP],
      account.address
    )
    await expect(promise).rejects.toBeInstanceOf(PerpsError)
    await expect(promise).rejects.toMatchObject({
      code: PerpsErrorCode.SDKError,
    })
  })

  it('rejects non-SIWE steps under the SIWE method', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.SIWE,
        [PLACE_ORDER_STEP],
        account.address,
        { userWallet }
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })
})

describe('ondoSignActions — HMAC', () => {
  it('signs each request step with the stored API key and attaches the hmac material', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())
    const apiKey = apiKeyFixture()
    await deps.apiKeyStore.set(account.address, apiKey)

    const before = Date.now()
    const signed = (await ondoSignActions(
      deps,
      SigningMethod.HMAC,
      [PLACE_ORDER_STEP],
      account.address
    )) as HmacSignedActionStep[]
    const after = Date.now()

    const [step] = signed
    expect(step.action).toBe(ActionType.PLACE_ORDER)
    expect(step.request).toEqual(PLACE_ORDER_STEP.request)
    expect(step.hmac.keyId).toBe(apiKey.keyId)

    const { timestampMs } = step.hmac
    expect(timestampMs).toBeGreaterThanOrEqual(before)
    expect(timestampMs).toBeLessThanOrEqual(after)

    const expected = await hmacSignRequest(apiKey.apiSecret, {
      timestampMs,
      method: PLACE_ORDER_STEP.request.method,
      pathWithQuery: PLACE_ORDER_STEP.request.path,
      body: PLACE_ORDER_STEP.request.body,
    })
    expect(step.hmac.signature).toBe(expected)
  })

  it('creates an API key on first use, JWT-authorized, and stores it immediately', async () => {
    const created = createdApiKeyFixture({ keyId: 'created-key' })
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: created }))
    const deps = makeDeps(fetchImpl)
    await deps.tokenStore.set(account.address, tokenFixture())

    const signed = (await ondoSignActions(
      deps,
      SigningMethod.HMAC,
      [PLACE_ORDER_STEP],
      account.address
    )) as HmacSignedActionStep[]

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/v1/api_keys`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'lifi-perps',
      scopes: ['trade'],
    })
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer ondo-jwt-token'
    )

    expect(signed[0].hmac.keyId).toBe('created-key')
    // The secret returned only at creation is mapped and persisted immediately.
    await expect(deps.apiKeyStore.get(account.address)).resolves.toEqual({
      keyId: 'created-key',
      apiSecret: created.secretKey,
      name: created.name,
      createdAt: created.createdAt,
      scopes: created.scopes,
    })
  })

  it('reuses the stored API key without creating a new one', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const deps = makeDeps(fetchImpl)
    await deps.apiKeyStore.set(account.address, apiKeyFixture())

    await ondoSignActions(
      deps,
      SigningMethod.HMAC,
      [PLACE_ORDER_STEP],
      account.address
    )

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws OndoSessionExpiredError when key creation is required but no session token is stored', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.HMAC,
        [PLACE_ORDER_STEP],
        account.address
      )
    ).rejects.toBeInstanceOf(OndoSessionExpiredError)
  })

  it('rejects steps without a request under the hmac method', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())
    await deps.apiKeyStore.set(account.address, apiKeyFixture())

    await expect(
      ondoSignActions(deps, SigningMethod.HMAC, [SIWE_STEP], account.address)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })
})

describe('ondoSignActions — API key wire mapping', () => {
  it('maps the venue secretKey wire field into a usable stored apiSecret that round-trips into HMAC signing', async () => {
    const created = createdApiKeyFixture()
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: created }))
    const deps = makeDeps(fetchImpl)
    await deps.tokenStore.set(account.address, tokenFixture())

    await ondoSignActions(
      deps,
      SigningMethod.HMAC,
      [PLACE_ORDER_STEP],
      account.address
    )

    const stored = await deps.apiKeyStore.get(account.address)
    expect(stored).not.toBeNull()
    expect(stored?.apiSecret).toBe(created.secretKey)

    const signature = await hmacSignRequest(stored!.apiSecret, {
      timestampMs: 1,
      method: 'POST',
      pathWithQuery: '/v1/perps/orders',
      body: '{}',
    })
    expect(signature).toMatch(/^[0-9a-f]{64}$/)
  })

  it('signs with the mapped secret, not undefined', async () => {
    const created = createdApiKeyFixture()
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: created }))
    const deps = makeDeps(fetchImpl)
    await deps.tokenStore.set(account.address, tokenFixture())

    const signed = (await ondoSignActions(
      deps,
      SigningMethod.HMAC,
      [PLACE_ORDER_STEP],
      account.address
    )) as HmacSignedActionStep[]

    const { timestampMs } = signed[0].hmac
    const expected = await hmacSignRequest(created.secretKey, {
      timestampMs,
      method: PLACE_ORDER_STEP.request.method,
      pathWithQuery: PLACE_ORDER_STEP.request.path,
      body: PLACE_ORDER_STEP.request.body,
    })
    expect(signed[0].hmac.signature).toBe(expected)
  })

  it('throws loudly and persists nothing when the api_keys result carries no usable secret (future wire drift)', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: { keyId: 'k', name: 'lifi-perps', createdAt: 'x', scopes: [] },
      })
    )
    const deps = makeDeps(fetchImpl)
    await deps.tokenStore.set(account.address, tokenFixture())

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.HMAC,
        [PLACE_ORDER_STEP],
        account.address
      )
    ).rejects.toBeInstanceOf(OndoApiError)
    await expect(deps.apiKeyStore.get(account.address)).resolves.toBeNull()
  })
})

describe('ondoSignActions — SESSION', () => {
  it('accepts the venue terms with the session token and returns no signed steps', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: {} }))
    const deps = makeDeps(fetchImpl)
    const token = tokenFixture()
    await deps.tokenStore.set(account.address, token)

    const signed = await ondoSignActions(
      deps,
      SigningMethod.SESSION,
      [TERMS_STEP],
      account.address
    )

    expect(signed).toEqual([])
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/v1/agreement`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      termsVersion: 1,
      privacyVersion: 1,
    })
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer ondo-jwt-token'
    )
    // Acceptance is recorded server-side; the stored token is left untouched.
    await expect(deps.tokenStore.get(account.address)).resolves.toEqual(token)
  })

  it('throws OndoSessionExpiredError for the terms step without a stored session token', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const deps = makeDeps(fetchImpl)

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.SESSION,
        [TERMS_STEP],
        account.address
      )
    ).rejects.toBeInstanceOf(OndoSessionExpiredError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('creates and stores an API key for the register step when none is stored', async () => {
    const created = createdApiKeyFixture({ keyId: 'created-key' })
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: created }))
    const deps = makeDeps(fetchImpl)
    await deps.tokenStore.set(account.address, tokenFixture())

    const signed = await ondoSignActions(
      deps,
      SigningMethod.SESSION,
      [REGISTER_KEY_STEP],
      account.address
    )

    expect(signed).toEqual([])
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/v1/api_keys`)
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer ondo-jwt-token'
    )
    await expect(deps.apiKeyStore.get(account.address)).resolves.toEqual({
      keyId: 'created-key',
      apiSecret: created.secretKey,
      name: created.name,
      createdAt: created.createdAt,
      scopes: created.scopes,
    })
  })

  it('is a no-op for the register step when a key is already stored', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const deps = makeDeps(fetchImpl)
    await deps.apiKeyStore.set(account.address, apiKeyFixture())

    const signed = await ondoSignActions(
      deps,
      SigningMethod.SESSION,
      [REGISTER_KEY_STEP],
      account.address
    )

    expect(signed).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('hydrates and provisions the fixed deposit policy, then refreshes the canonical address', async () => {
    const depositAddress = '0x2222222222222222222222222222222222222222'
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, result: { accountID: 'acct-99' } })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, result: {} }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: [
            { address: depositAddress, coin: 'USDC', network: 'ethereum' },
          ],
        })
      )
    const deps = makeDeps(fetchImpl)
    await deps.tokenStore.set(account.address, tokenFixture())

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.SESSION,
        [CREATE_DEPOSIT_STEP],
        account.address
      )
    ).resolves.toEqual([])

    const accountCall = fetchImpl.mock.calls[0] as [string, RequestInit]
    const provisionCall = fetchImpl.mock.calls[1] as [string, RequestInit]
    const refreshCall = fetchImpl.mock.calls[2] as [string, RequestInit]
    expect(accountCall[0]).toBe(`${BASE_URL}/v1/account`)
    expect(provisionCall[0]).toBe(`${BASE_URL}/v1/provision_address`)
    expect(JSON.parse(provisionCall[1].body as string)).toEqual({
      network: 'ethereum',
      symbol: 'USDC',
      deposit_destination: { id: 'acct-99', wallet: 'margin' },
    })
    expect(new Headers(provisionCall[1].headers).get('authorization')).toBe(
      'Bearer ondo-jwt-token'
    )
    expect(refreshCall[0]).toBe(`${BASE_URL}/v1/wallet/deposit_address/list`)
    expect(JSON.parse(refreshCall[1].body as string)).toEqual({
      coins: ['USDC'],
      network: 'ethereum',
    })
  })

  it('rejects a missing or arbitrary deposit policy before provisioning', async () => {
    const missingFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, result: { accountID: 'acct-99' } })
      )
    const missingDeps = makeDeps(missingFetch)
    await missingDeps.tokenStore.set(account.address, tokenFixture())
    await expect(
      ondoSignActions(
        missingDeps,
        SigningMethod.SESSION,
        [
          {
            action: ActionType.CREATE_DEPOSIT_ADDRESS,
            session: {},
          } as ActionStep,
        ],
        account.address
      )
    ).rejects.toThrow(/unsupported deposit policy/)

    const arbitraryFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, result: { accountID: 'acct-99' } })
      )
    const arbitraryDeps = makeDeps(arbitraryFetch)
    await arbitraryDeps.tokenStore.set(account.address, tokenFixture())
    const arbitrary = {
      ...CREATE_DEPOSIT_STEP,
      session: {
        network: 'solana',
        symbol: 'USDT',
        depositDestination: { wallet: 'spot' },
      },
    }
    await expect(
      ondoSignActions(
        arbitraryDeps,
        SigningMethod.SESSION,
        [arbitrary],
        account.address
      )
    ).rejects.toThrow(/unsupported deposit policy/)
  })

  it('distinguishes a malformed refresh result from an empty address list', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, result: { accountID: 'acct-99' } })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, result: {} }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, result: { addresses: [{}] } })
      )
    const deps = makeDeps(fetchImpl)
    await deps.tokenStore.set(account.address, tokenFixture())
    await expect(
      ondoSignActions(
        deps,
        SigningMethod.SESSION,
        [CREATE_DEPOSIT_STEP],
        account.address
      )
    ).rejects.toThrow(/deposit-address response is malformed/)
  })

  it('uses the existing session-expiry path for a missing or rejected JWT', async () => {
    const missing = makeDeps(vi.fn<typeof fetch>())
    await expect(
      ondoSignActions(
        missing,
        SigningMethod.SESSION,
        [CREATE_DEPOSIT_STEP],
        account.address
      )
    ).rejects.toBeInstanceOf(OndoSessionExpiredError)

    const rejectedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: 'expired' }, 401)
      )
    const rejected = makeDeps(rejectedFetch)
    await rejected.tokenStore.set(account.address, tokenFixture())
    await expect(
      ondoSignActions(
        rejected,
        SigningMethod.SESSION,
        [CREATE_DEPOSIT_STEP],
        account.address
      )
    ).rejects.toBeInstanceOf(OndoSessionExpiredError)
  })

  it('executes a request-bearing session step against the venue with the session token and returns no signed steps', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: {} }))
    const deps = makeDeps(fetchImpl)
    await deps.tokenStore.set(account.address, tokenFixture())

    const signed = await ondoSignActions(
      deps,
      SigningMethod.SESSION,
      [REFERRAL_SESSION_STEP],
      account.address
    )

    expect(signed).toEqual([])
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/v1/account/referral`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ code: 'LIFI' })
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer ondo-jwt-token'
    )
  })

  it('throws OndoSessionExpiredError for a request-bearing session step without a stored session token', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const deps = makeDeps(fetchImpl)

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.SESSION,
        [REFERRAL_SESSION_STEP],
        account.address
      )
    ).rejects.toBeInstanceOf(OndoSessionExpiredError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a step that is neither a session marker nor request-bearing under the session method', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())

    await expect(
      ondoSignActions(deps, SigningMethod.SESSION, [WASM_STEP], account.address)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })

  it('rejects a bare session marker with an action it has no executor for', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.SESSION,
        [{ action: ActionType.SET_REFERRAL, session: {} }],
        account.address
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })
})

describe('ondoSignActions — unsupported methods', () => {
  it('throws SDKError for signing methods Ondo does not use', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.EIP712,
        [PLACE_ORDER_STEP],
        account.address
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })
})
