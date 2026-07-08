import { createMemoryStorage, PerpsError } from '@lifi/perps-sdk'
import type {
  RestCallActionStep,
  RestCallSignedActionStep,
  SiweActionStep,
  SiweSignedActionStep,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode, SigningMethod } from '@lifi/perps-types'
import { createWalletClient, http, verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import type { OndoAuthToken } from '../types/auth.js'
import { OndoApiClient, OndoSessionExpiredError } from '../utils/apiClient.js'
import { OndoTokenStore } from './OndoTokenStore.js'
import { executeOndoRestCallActions, ondoSignActions } from './signActions.js'

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

const PLACE_ORDER_STEP: RestCallActionStep = {
  action: ActionType.PLACE_ORDER,
  request: {
    method: 'POST',
    path: '/v1/perps/orders',
    body: { market: 'AAPL-USD.P', side: 'buy', size: '1', type: 'market' },
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

describe('ondoSignActions — AUTH_TOKEN', () => {
  it('attaches the stored session JWT as a Bearer header on each REST step', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())
    await deps.tokenStore.set(account.address, tokenFixture())

    const signed = await ondoSignActions(
      deps,
      SigningMethod.AUTH_TOKEN,
      [PLACE_ORDER_STEP],
      account.address
    )

    expect(signed).toEqual([
      {
        action: ActionType.PLACE_ORDER,
        request: PLACE_ORDER_STEP.request,
        headers: { Authorization: 'Bearer ondo-jwt-token' },
      },
    ])
  })

  it('throws OndoSessionExpiredError when no valid session token is stored', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.AUTH_TOKEN,
        [PLACE_ORDER_STEP],
        account.address
      )
    ).rejects.toBeInstanceOf(OndoSessionExpiredError)
  })

  it('treats an expired stored token as absent', async () => {
    const deps = makeDeps(vi.fn<typeof fetch>())
    await deps.tokenStore.set(
      account.address,
      tokenFixture({ expirationSecs: nowSecs() - 1 })
    )

    await expect(
      ondoSignActions(
        deps,
        SigningMethod.AUTH_TOKEN,
        [PLACE_ORDER_STEP],
        account.address
      )
    ).rejects.toBeInstanceOf(OndoSessionExpiredError)
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

describe('executeOndoRestCallActions', () => {
  const signedStep = (
    overrides?: Partial<RestCallSignedActionStep>
  ): RestCallSignedActionStep => ({
    action: ActionType.PLACE_ORDER,
    request: PLACE_ORDER_STEP.request,
    headers: { Authorization: 'Bearer ondo-jwt-token' },
    ...overrides,
  })

  it('executes steps against the venue with the prebuilt headers and extracts orderId', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: { orderId: 'ord-1', status: 'open' },
      })
    )
    const { client } = makeDeps(fetchImpl)

    const results = await executeOndoRestCallActions(client, [signedStep()])

    expect(results).toEqual([
      { action: ActionType.PLACE_ORDER, success: true, orderId: 'ord-1' },
    ])
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/v1/perps/orders`)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer ondo-jwt-token'
    )
  })

  it('runs steps sequentially and skips the remainder after a failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: 'insufficient margin',
          error_code: 'INSUFFICIENT_MARGIN',
        },
        400
      )
    )
    const { client } = makeDeps(fetchImpl)

    const results = await executeOndoRestCallActions(client, [
      signedStep(),
      signedStep({
        action: ActionType.CANCEL_ORDER,
        request: { method: 'DELETE', path: '/v1/perps/orders/ord-0' },
      }),
    ])

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      action: ActionType.PLACE_ORDER,
      success: false,
      error: expect.stringContaining('insufficient margin'),
    })
    expect(results[1]).toMatchObject({
      action: ActionType.CANCEL_ORDER,
      success: false,
      error: expect.stringContaining('preceding'),
    })
  })

  it('reports success without orderId when the venue result carries none', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: null }))
    const { client } = makeDeps(fetchImpl)

    const results = await executeOndoRestCallActions(client, [
      signedStep({
        action: ActionType.UPDATE_LEVERAGE,
        request: {
          method: 'POST',
          path: '/v1/perps/leverage',
          body: { leverage: 5 },
        },
      }),
    ])

    expect(results).toEqual([
      { action: ActionType.UPDATE_LEVERAGE, success: true },
    ])
  })
})
