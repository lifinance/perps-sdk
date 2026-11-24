import { createMemoryStorage, PerpsExecutionError } from '@lifi/perps-sdk'
import {
  ActionType,
  PerpsErrorCode,
  SigningMethod,
  type StarkActionStep,
  UserActionStatus,
} from '@lifi/perps-types'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { createFetchMock, errorAnswer, okAnswer } from '../../test/fetchMock.js'
import {
  registrationCases,
  signingKey,
  starkFixtures,
  toStarkMessage,
} from '../../test/fixtures/starkFixtures.js'
import {
  DEFAULT_EXTENDED_API_URL,
  EXTENDED_SIGNING_DOMAIN,
} from '../constants.js'
import { EXTENDED_MAINNET_STARK_DOMAIN } from '../signing/starkMessageHash.js'
import { ExtendedApiClient } from '../utils/apiClient.js'
import {
  ExtendedCredentialStore,
  type ExtendedCredentials,
} from './ExtendedCredentialStore.js'
import { extendedSignActions } from './signActions.js'

const address = starkFixtures.meta.ethAddress
const credentials: ExtendedCredentials = {
  starkPrivateKey: signingKey.starkPrivateKey,
  starkPublicKey: signingKey.starkPublicKey,
  accountId: '330870',
  positionId: '430876',
  apiKey: 'test-api-key',
}

const SIGNATURE_PATHS = [
  ['settlement', 'signature'],
  ['takeProfit', 'settlement', 'signature'],
  ['stopLoss', 'settlement', 'signature'],
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const orderFixture = (name: string) => {
  const order = starkFixtures.orders.find((fixture) => fixture.name === name)
  if (order === undefined) {
    throw new Error(`No order fixture named '${name}'.`)
  }
  return order
}

/** The fixture order as the backend builds it: the body without signatures. */
function buildOrderStep(name: string): StarkActionStep {
  const order = orderFixture(name)
  const body = structuredClone(order.request)
  for (const path of SIGNATURE_PATHS) {
    let parent: unknown = body
    for (const key of path.slice(0, -1)) {
      parent = isRecord(parent) ? parent[key] : undefined
    }
    if (isRecord(parent)) {
      delete parent.signature
    }
  }
  return {
    action: ActionType.PLACE_ORDER,
    stark: {
      request: { method: 'POST', path: '/api/v1/user/order', body },
      messages: order.hashCalls.map((hashCall, index) => ({
        ...toStarkMessage(hashCall).message,
        signaturePath: SIGNATURE_PATHS[index],
      })),
    },
  }
}

async function setup(
  answers: Parameters<typeof createFetchMock>[0],
  stored: ExtendedCredentials | null = credentials
) {
  const { fetchImpl, requests } = createFetchMock(answers)
  const credentialStore = new ExtendedCredentialStore(
    createMemoryStorage(),
    DEFAULT_EXTENDED_API_URL
  )
  if (stored !== null) {
    await credentialStore.set(address, stored)
  }
  const deps = {
    client: new ExtendedApiClient(DEFAULT_EXTENDED_API_URL, { fetchImpl }),
    credentialStore,
    baseUrl: DEFAULT_EXTENDED_API_URL,
    signingDomain: EXTENDED_SIGNING_DOMAIN,
    starkDomain: EXTENDED_MAINNET_STARK_DOMAIN,
  }
  return { deps, requests }
}

const placedOrderAnswer = {
  status: 200,
  body: '{"status":"OK","data":{"id":1802919074413810230,"externalId":"ua-1"}}',
}

describe('extendedSignActions STARK', () => {
  it.each([
    'limit buy GTT nonce=1',
    'limit buy with position TP/SL',
    'limit sell builder fee 5bp',
  ])('sends the body of the Python SDK with every signature, then reports it: %s', async (name) => {
    const { deps, requests } = await setup([placedOrderAnswer])
    const step = buildOrderStep(name)

    const result = await extendedSignActions(
      deps,
      SigningMethod.STARK,
      [step],
      address
    )

    expect(requests[0].body).toEqual(orderFixture(name).request)
    expect(requests[0].headers['x-api-key']).toBe('test-api-key')
    expect(result).toEqual({
      signed: [
        {
          action: ActionType.PLACE_ORDER,
          stark: {
            request: {
              ...step.stark.request,
              body: orderFixture(name).request,
            },
            messages: step.stark.messages,
          },
          clientSent: { orderId: '1802919074413810230' },
        },
      ],
      executed: [],
    })
  })

  it('sends a request that the API key alone authorizes without a signature', async () => {
    const { deps, requests } = await setup([okAnswer(null)])
    const updateLeverage: StarkActionStep = {
      action: ActionType.UPDATE_LEVERAGE,
      stark: {
        request: {
          method: 'PATCH',
          path: '/api/v1/user/leverage',
          body: { market: 'BTC-USD', leverage: '10' },
        },
        messages: [],
      },
    }

    const result = await extendedSignActions(
      deps,
      SigningMethod.STARK,
      [updateLeverage],
      address
    )

    expect(requests[0]).toMatchObject({
      method: 'PATCH',
      body: { market: 'BTC-USD', leverage: '10' },
    })
    expect(result.executed).toEqual([])
    expect(result.signed).toEqual([
      {
        action: ActionType.UPDATE_LEVERAGE,
        stark: updateLeverage.stark,
        clientSent: {},
      },
    ])
  })

  it('reports a refusal as Failed and sends no later step', async () => {
    const { deps, requests } = await setup([
      errorAnswer(400, 1140, 'New order cost exceeds available balance'),
    ])
    const step = buildOrderStep('limit buy GTT nonce=1')

    const result = await extendedSignActions(
      deps,
      SigningMethod.STARK,
      [step, step],
      address
    )

    expect(requests).toHaveLength(1)
    expect(result.executed).toEqual([
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Failed,
        error: expect.stringContaining('1140'),
        errorCode: PerpsErrorCode.ExchangeRejected,
      },
    ])
  })

  it('reports a refused API key as Failed with Unauthorized', async () => {
    const { deps } = await setup([{ status: 401, body: '' }])

    const result = await extendedSignActions(
      deps,
      SigningMethod.STARK,
      [buildOrderStep('limit buy GTT nonce=1')],
      address
    )

    expect(result.executed[0]).toMatchObject({
      status: UserActionStatus.Failed,
      errorCode: PerpsErrorCode.Unauthorized,
    })
  })

  it.each([
    ['a network failure', new TypeError('fetch failed')],
    ['a 5xx answer', { status: 500, body: 'internal error' }],
  ])('reports %s as Indeterminate', async (_label, answer) => {
    const { deps } = await setup([answer])

    const result = await extendedSignActions(
      deps,
      SigningMethod.STARK,
      [buildOrderStep('limit buy GTT nonce=1')],
      address
    )

    expect(result.executed[0]).toMatchObject({
      status: UserActionStatus.Indeterminate,
      error: expect.stringContaining('Check your account history'),
    })
  })

  it('refuses to sign a message that spends from another position', async () => {
    const { deps, requests } = await setup([placedOrderAnswer], {
      ...credentials,
      positionId: '430877',
    })

    await expect(
      extendedSignActions(
        deps,
        SigningMethod.STARK,
        [buildOrderStep('limit buy GTT nonce=1')],
        address
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(requests).toHaveLength(0)
  })

  const fixtureMessage = (
    hashCall: (typeof starkFixtures.transfers)[number]['hashCalls'][number]
  ): StarkActionStep['stark']['messages'][number] => ({
    ...toStarkMessage(hashCall).message,
    signaturePath: ['settlement', 'signature'],
  })

  it.each([
    [
      'a transfer for an order',
      ActionType.PLACE_ORDER,
      fixtureMessage(starkFixtures.transfers[0].hashCalls[0]),
    ],
    [
      'a transfer for a withdrawal',
      ActionType.WITHDRAWAL,
      fixtureMessage(starkFixtures.transfers[0].hashCalls[0]),
    ],
    [
      'a withdrawal for an order',
      ActionType.PLACE_ORDER,
      fixtureMessage(starkFixtures.withdrawals[0].hashCalls[0]),
    ],
  ])('refuses to sign %s', async (_label, action, message) => {
    const { deps, requests } = await setup([placedOrderAnswer])
    const step: StarkActionStep = {
      action,
      stark: {
        request: { method: 'POST', path: '/api/v1/user/order', body: {} },
        messages: [message],
      },
    }

    await expect(
      extendedSignActions(deps, SigningMethod.STARK, [step], address)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(requests).toHaveLength(0)
  })

  it.each([
    ['__proto__', 'polluted'],
    ['constructor', 'prototype', 'polluted'],
  ])('refuses a signature path through a prototype key: %s', async (...signaturePath) => {
    const { deps, requests } = await setup([placedOrderAnswer])
    const step = buildOrderStep('limit buy GTT nonce=1')
    step.stark.messages[0].signaturePath = signaturePath

    await expect(
      extendedSignActions(deps, SigningMethod.STARK, [step], address)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(requests).toHaveLength(0)
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })

  it.each([
    '@evil.example/x',
    '.evil.example/x',
    ':8443/api/v1/user/order',
    '//evil.example/x',
    'api/v1/user/order',
  ])('refuses a request path that leaves the Extended host: %s', async (path) => {
    const { deps, requests } = await setup([placedOrderAnswer])
    const step: StarkActionStep = {
      action: ActionType.CANCEL_ORDER,
      stark: { request: { method: 'DELETE', path }, messages: [] },
    }

    await expect(
      extendedSignActions(deps, SigningMethod.STARK, [step], address)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(requests).toHaveLength(0)
  })

  it('keeps the earlier results when a later step cannot be signed', async () => {
    const { deps } = await setup([placedOrderAnswer])
    const valid = buildOrderStep('limit buy GTT nonce=1')
    const noBody: StarkActionStep = {
      ...valid,
      stark: {
        ...valid.stark,
        request: { method: 'POST', path: '/api/v1/user/order' },
      },
    }

    const error = extendedSignActions(
      deps,
      SigningMethod.STARK,
      [valid, noBody],
      address
    )

    await expect(error).rejects.toBeInstanceOf(PerpsExecutionError)
    await expect(error).rejects.toMatchObject({
      response: {
        results: [{ status: UserActionStatus.Submitted }],
      },
    })
  })

  it('returns the signed onboarding request unsent, without credentials', async () => {
    const { deps, requests } = await setup([], null)
    const wallet = createWalletClient({
      account: privateKeyToAccount(`0x${starkFixtures.meta.ethPrivateKey}`),
      transport: http('http://127.0.0.1:1'),
    })
    const [registration] = registrationCases

    const result = await extendedSignActions(
      deps,
      SigningMethod.STARK,
      [
        {
          action: ActionType.CREATE_ACCOUNT,
          stark: {
            request: {
              method: 'POST',
              path: '/auth/onboard',
              body: {
                accountCreation: {
                  ...registration.payload.accountCreation,
                  accountIndex: 0,
                },
                referralCode: null,
              },
            },
            messages: [],
          },
        },
      ],
      address,
      { userWallet: wallet }
    )

    expect(requests).toEqual([])
    expect(result.executed).toEqual([])
    expect(result.signed).toHaveLength(1)
    expect(result.signed[0]).not.toHaveProperty('clientSent')
  })

  it('requires the setup when this device has no credentials', async () => {
    const { deps } = await setup([], null)

    await expect(
      extendedSignActions(
        deps,
        SigningMethod.STARK,
        [buildOrderStep('limit buy GTT nonce=1')],
        address
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SetupRequired })
  })
})

describe('extendedSignActions SESSION', () => {
  const wallet = createWalletClient({
    account: privateKeyToAccount(`0x${starkFixtures.meta.ethPrivateKey}`),
    transport: http('http://127.0.0.1:1'),
  })
  const registerStep = {
    action: ActionType.REGISTER_API_KEY,
    session: {},
  } as const

  it('creates the API key for REGISTER_API_KEY and stores the credentials', async () => {
    const { deps } = await setup(
      [
        okAnswer({ key: 'test-api-key' }),
        okAnswer({
          accountId: 330870,
          l2Key: signingKey.starkPublicKey,
          l2Vault: '430876',
        }),
      ],
      null
    )

    const result = await extendedSignActions(
      deps,
      SigningMethod.SESSION,
      [registerStep],
      address,
      { userWallet: wallet }
    )

    expect(result).toEqual({
      signed: [],
      executed: [
        {
          action: ActionType.REGISTER_API_KEY,
          status: UserActionStatus.Accepted,
        },
      ],
    })
    expect(await deps.credentialStore.get(address)).toEqual(credentials)
  })

  it('requires the user wallet', async () => {
    const { deps } = await setup([], null)

    await expect(
      extendedSignActions(deps, SigningMethod.SESSION, [registerStep], address)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })
})

describe('extendedSignActions', () => {
  it('refuses a signing method that Extended does not use', async () => {
    const { deps } = await setup([])

    await expect(
      extendedSignActions(deps, SigningMethod.EIP712, [], address)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })
})
