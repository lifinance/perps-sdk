import { createMemoryStorage, PerpsError } from '@lifi/perps-sdk'
import type {
  ApiKeyRestActionStep,
  ApiKeyRestSignedActionStep,
  SiweActionStep,
  SiweSignedActionStep,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode, SigningMethod } from '@lifi/perps-types'
import { createWalletClient, http, verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import type { OndoApiKey, OndoAuthToken } from '../types/auth.js'
import { OndoApiClient, OndoSessionExpiredError } from '../utils/apiClient.js'
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
  newAccount: false,
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

const PLACE_ORDER_STEP: ApiKeyRestActionStep = {
  action: ActionType.PLACE_ORDER,
  request: {
    method: 'POST',
    path: '/v1/perps/orders',
    body: '{"market":"AAPL-USD.P","side":"buy","size":"1","type":"market"}',
  },
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

  it('accepts the venue terms on a first login and not on a returning one', async () => {
    const newAccountFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: tokenFixture({ newAccount: true }),
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, result: {} }))
    const deps = makeDeps(newAccountFetch)

    await ondoSignActions(
      deps,
      SigningMethod.SIWE,
      [SIWE_STEP],
      account.address,
      {
        userWallet,
      }
    )

    expect(newAccountFetch).toHaveBeenCalledTimes(2)
    const [agreementUrl, agreementInit] = newAccountFetch.mock.calls[1] as [
      string,
      RequestInit,
    ]
    expect(agreementUrl).toBe(`${BASE_URL}/v1/agreement`)
    expect(JSON.parse(agreementInit.body as string)).toEqual({
      termsVersion: 1,
      privacyVersion: 1,
    })
    expect(new Headers(agreementInit.headers).get('authorization')).toBe(
      'Bearer ondo-jwt-token'
    )

    const returningFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: tokenFixture({ newAccount: false }),
      })
    )
    const returningDeps = makeDeps(returningFetch)

    await ondoSignActions(
      returningDeps,
      SigningMethod.SIWE,
      [SIWE_STEP],
      account.address,
      { userWallet }
    )

    expect(returningFetch).toHaveBeenCalledTimes(1)
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

describe('ondoSignActions — API_KEY', () => {
  it('signs each REST step with the stored API key and attaches the HMAC headers', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())
    const apiKey = apiKeyFixture()
    await deps.apiKeyStore.set(account.address, apiKey)

    const before = Date.now()
    const signed = (await ondoSignActions(
      deps,
      SigningMethod.API_KEY,
      [PLACE_ORDER_STEP],
      account.address
    )) as ApiKeyRestSignedActionStep[]
    const after = Date.now()

    const [step] = signed
    expect(step.action).toBe(ActionType.PLACE_ORDER)
    expect(step.request).toEqual(PLACE_ORDER_STEP.request)
    expect(step.headers['ONDO-KEY-ID']).toBe(apiKey.keyId)

    const timestampMs = Number(step.headers['ONDO-TIMESTAMP'])
    expect(timestampMs).toBeGreaterThanOrEqual(before)
    expect(timestampMs).toBeLessThanOrEqual(after)

    const expected = await hmacSignRequest(apiKey.apiSecret, {
      timestampMs,
      method: PLACE_ORDER_STEP.request.method,
      pathWithQuery: PLACE_ORDER_STEP.request.path,
      body: PLACE_ORDER_STEP.request.body,
    })
    expect(step.headers['ONDO-SIGN']).toBe(expected)
  })

  it('mints an API key on first use, JWT-authorized, and stores it immediately', async () => {
    const minted = apiKeyFixture({ keyId: 'minted-key' })
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: minted }))
    const deps = makeDeps(fetchImpl)
    await deps.tokenStore.set(account.address, tokenFixture())

    const signed = (await ondoSignActions(
      deps,
      SigningMethod.API_KEY,
      [PLACE_ORDER_STEP],
      account.address
    )) as ApiKeyRestSignedActionStep[]

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

    expect(signed[0].headers['ONDO-KEY-ID']).toBe('minted-key')
    // The secret returned only at creation is persisted immediately.
    await expect(deps.apiKeyStore.get(account.address)).resolves.toEqual(minted)
  })

  it('reuses the stored API key without minting a new one', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const deps = makeDeps(fetchImpl)
    await deps.apiKeyStore.set(account.address, apiKeyFixture())

    await ondoSignActions(
      deps,
      SigningMethod.API_KEY,
      [PLACE_ORDER_STEP],
      account.address
    )

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws OndoSessionExpiredError when minting is required but no session token is stored', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.API_KEY,
        [PLACE_ORDER_STEP],
        account.address
      )
    ).rejects.toBeInstanceOf(OndoSessionExpiredError)
  })

  it('rejects non-REST steps under the API_KEY method', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())
    await deps.apiKeyStore.set(account.address, apiKeyFixture())

    await expect(
      ondoSignActions(deps, SigningMethod.API_KEY, [SIWE_STEP], account.address)
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
