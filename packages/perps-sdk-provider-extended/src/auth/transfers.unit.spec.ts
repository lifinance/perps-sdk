import { createMemoryStorage, PerpsExecutionError } from '@lifi/perps-sdk'
import {
  ActionType,
  type EvmTxActionStep,
  PerpsErrorCode,
  SigningMethod,
  type StarkActionStep,
  UserActionStatus,
} from '@lifi/perps-types'
import {
  type Address,
  type Chain,
  createWalletClient,
  custom,
  decodeFunctionData,
  type Hex,
  parseAbi,
} from 'viem'
import { arbitrum, mainnet } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import {
  signingKey,
  starkFixtures,
  toStarkMessage,
} from '../../test/fixtures/starkFixtures.js'
import {
  DEFAULT_EXTENDED_API_URL,
  EXTENDED_DEPOSIT_COLLATERAL,
  EXTENDED_SIGNING_DOMAIN,
} from '../constants.js'
import { EXTENDED_MAINNET_STARK_DOMAIN } from '../signing/starkMessageHash.js'
import { ExtendedApiClient } from '../utils/apiClient.js'
import {
  ExtendedCredentialStore,
  type ExtendedCredentials,
} from './ExtendedCredentialStore.js'
import { extendedSignActions } from './signActions.js'

const ADDRESS = starkFixtures.meta.ethAddress
const ARB_BRIDGE: Address = '0x10417734001162Ea139e8b044DFe28DbB8B28ad0'
const CREDENTIALS: ExtendedCredentials = {
  starkPrivateKey: signingKey.starkPrivateKey,
  starkPublicKey: signingKey.starkPublicKey,
  accountId: '330870',
  positionId: '430876',
  apiKey: 'test-api-key',
}
const ok = (data: unknown) =>
  new Response(JSON.stringify({ status: 'OK', data }))

const refused = (status: number) => () =>
  new Response('{"status":"ERROR"}', { status })

/**
 * Extended answers by path; `calls` records each method, path and body. A
 * route that is a function gives its own response.
 */
function venue(routes: Record<string, unknown>) {
  const calls: { method: string; path: string; body: unknown }[] = []
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input).slice(DEFAULT_EXTENDED_API_URL.length)
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      path,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const route = routes[`${method} ${path.split('?')[0]}`]
    if (route === undefined) {
      return new Response('{"status":"ERROR"}', { status: 404 })
    }
    return typeof route === 'function' ? (route as () => Response)() : ok(route)
  })
  return { fetchImpl, calls }
}

async function deps(fetchImpl: typeof fetch) {
  const credentialStore = new ExtendedCredentialStore(
    createMemoryStorage(),
    DEFAULT_EXTENDED_API_URL
  )
  await credentialStore.set(ADDRESS, CREDENTIALS)
  return {
    client: new ExtendedApiClient(DEFAULT_EXTENDED_API_URL, { fetchImpl }),
    credentialStore,
    baseUrl: DEFAULT_EXTENDED_API_URL,
    signingDomain: EXTENDED_SIGNING_DOMAIN,
    starkDomain: EXTENDED_MAINNET_STARK_DOMAIN,
  }
}

describe('Extended withdrawal', () => {
  const [fixture] = starkFixtures.withdrawals

  /** The fixture withdrawal as the backend builds it: no recipient, quote or signature. */
  function withdrawalStep(): StarkActionStep {
    const { quoteId: _quoteId, settlement, ...rest } = fixture.request
    const {
      recipient: _recipient,
      signature: _signature,
      ...settlementFields
    } = settlement
    const { message } = toStarkMessage(fixture.hashCalls[0])
    if (message.type !== 'withdrawal') {
      throw new Error('The withdrawal fixture has no withdrawal message.')
    }
    return {
      action: ActionType.WITHDRAWAL,
      stark: {
        request: {
          method: 'POST',
          path: '/api/v1/user/withdrawal',
          body: { ...rest, settlement: settlementFields },
        },
        messages: [
          {
            type: 'withdrawal',
            fields: { ...message.fields, recipient: '0x0' },
            signaturePath: ['settlement', 'signature'],
          },
        ],
      },
    }
  }

  it('fills the account bridge address and a committed quote, then sends the Python SDK body', async () => {
    const { fetchImpl, calls } = venue({
      'GET /api/v1/user/account/info': {
        bridgeStarknetAddress:
          '0x022bc969fe217f91a32afe6dbd0c84bb3d1681377b38f928e5ce70555a2ca7dd',
      },
      'GET /api/v1/user/bridge/quote': {
        id: '6afd8157fc04af19fd7f2b66',
        fee: '0.011',
      },
      'POST /api/v1/user/bridge/quote': null,
      'POST /api/v1/user/withdrawal': 1234,
    })

    const result = await extendedSignActions(
      await deps(fetchImpl),
      SigningMethod.STARK,
      [withdrawalStep()],
      ADDRESS
    )

    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /api/v1/user/account/info',
      'GET /api/v1/user/bridge/quote?chainIn=ARC&chainOut=ARB&amount=19.9',
      'POST /api/v1/user/bridge/quote?id=6afd8157fc04af19fd7f2b66',
      'POST /api/v1/user/withdrawal',
    ])
    expect(calls[3].body).toEqual(fixture.request)
    expect(result.executed).toEqual([])
    expect(result.signed).toEqual([
      expect.objectContaining({
        action: ActionType.WITHDRAWAL,
        stark: expect.objectContaining({
          request: expect.objectContaining({ body: fixture.request }),
        }),
        clientSent: { orderId: '1234' },
      }),
    ])
  })

  const BRIDGE_ADDRESS =
    '0x022bc969fe217f91a32afe6dbd0c84bb3d1681377b38f928e5ce70555a2ca7dd'
  const withdrawalRoutes = {
    'GET /api/v1/user/account/info': { bridgeStarknetAddress: BRIDGE_ADDRESS },
    'GET /api/v1/user/bridge/quote': {
      id: '6afd8157fc04af19fd7f2b66',
      fee: '0.011',
    },
    'POST /api/v1/user/bridge/quote': null,
    'POST /api/v1/user/withdrawal': 1234,
  }

  it.each([
    ['above the limit', { id: '6afd8157fc04af19fd7f2b66', fee: '2.01' }],
    ['missing', { id: '6afd8157fc04af19fd7f2b66' }],
    ['not a decimal', { id: '6afd8157fc04af19fd7f2b66', fee: '1e1' }],
  ])('refuses a quote whose fee is %s before it commits the quote', async (_label, quote) => {
    const { fetchImpl, calls } = venue({
      ...withdrawalRoutes,
      'GET /api/v1/user/bridge/quote': quote,
    })

    await expect(
      extendedSignActions(
        await deps(fetchImpl),
        SigningMethod.STARK,
        [withdrawalStep()],
        ADDRESS
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(calls.map(({ method }) => method)).toEqual(['GET', 'GET'])
  })

  it.each([
    ['an empty string', ''],
    ['null', null],
    ['zero', '0x0'],
  ])('refuses a bridge address that is %s before it commits a quote', async (_label, bridgeStarknetAddress) => {
    const { fetchImpl, calls } = venue({
      ...withdrawalRoutes,
      'GET /api/v1/user/account/info': { bridgeStarknetAddress },
    })

    await expect(
      extendedSignActions(
        await deps(fetchImpl),
        SigningMethod.STARK,
        [withdrawalStep()],
        ADDRESS
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(calls.map(({ path }) => path)).toEqual(['/api/v1/user/account/info'])
  })

  it('reports a refused API key as Failed with Unauthorized, sending no withdrawal', async () => {
    const { fetchImpl, calls } = venue({
      ...withdrawalRoutes,
      'GET /api/v1/user/account/info': refused(401),
    })

    const result = await extendedSignActions(
      await deps(fetchImpl),
      SigningMethod.STARK,
      [withdrawalStep()],
      ADDRESS
    )

    expect(result).toEqual({
      signed: [],
      executed: [
        expect.objectContaining({
          action: ActionType.WITHDRAWAL,
          status: UserActionStatus.Failed,
          errorCode: PerpsErrorCode.Unauthorized,
        }),
      ],
    })
    expect(calls).toHaveLength(1)
  })

  it('reports a refused quote as Failed, sending no withdrawal', async () => {
    const { fetchImpl, calls } = venue({
      ...withdrawalRoutes,
      'GET /api/v1/user/bridge/quote': refused(400),
    })

    const result = await extendedSignActions(
      await deps(fetchImpl),
      SigningMethod.STARK,
      [withdrawalStep()],
      ADDRESS
    )

    expect(result.executed).toEqual([
      expect.objectContaining({
        status: UserActionStatus.Failed,
        errorCode: PerpsErrorCode.ExchangeRejected,
      }),
    ])
    expect(calls.map(({ method }) => method)).toEqual(['GET', 'GET'])
  })

  const withChange = (
    change: (step: StarkActionStep) => void
  ): StarkActionStep => {
    const step = withdrawalStep()
    change(step)
    return step
  }

  it.each([
    [
      'a request amount that differs',
      withChange((step) => {
        step.stark.request.body = { ...step.stark.request.body, amount: '1' }
      }),
    ],
    [
      'a signed amount that differs',
      withChange((step) => {
        const [message] = step.stark.messages
        message.fields = { ...message.fields, amount: '1000000' }
      }),
    ],
    [
      'a settlement amount that differs',
      withChange((step) => {
        const body = step.stark.request.body ?? {}
        body.settlement = {
          ...(body.settlement as object),
          amount: '1000000',
        }
      }),
    ],
    [
      'a request amount past the settlement precision',
      withChange((step) => {
        step.stark.request.body = {
          ...step.stark.request.body,
          amount: '19.9000004',
        }
      }),
    ],
    [
      'a signed amount that is not an integer',
      withChange((step) => {
        const [message] = step.stark.messages
        message.fields = { ...message.fields, amount: '19.9' }
      }),
    ],
    [
      'a destination chain that Extended does not bridge to',
      withChange((step) => {
        step.stark.request.body = {
          ...step.stark.request.body,
          chainId: 'STRK',
        }
      }),
    ],
    [
      'a message that spends from another position',
      withChange((step) => {
        const [message] = step.stark.messages
        message.fields = { ...message.fields, positionId: '1' }
      }),
    ],
    [
      'a second message',
      withChange((step) => {
        step.stark.messages.push(step.stark.messages[0])
      }),
    ],
    [
      'no withdrawal message',
      withChange((step) => {
        step.stark.messages = []
      }),
    ],
  ])('refuses %s before it calls Extended', async (_label, step) => {
    const { fetchImpl, calls } = venue({})

    await expect(
      extendedSignActions(
        await deps(fetchImpl),
        SigningMethod.STARK,
        [step],
        ADDRESS
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(calls).toEqual([])
  })
})

describe('Extended deposit', () => {
  const QUOTE_ID = '6afd8157fc04af19fd7f2b66'
  const AMOUNT = '20000000'
  const DEPOSIT_ABI = [
    'function depositWithId(address token, uint256 amount, uint256 commitmentId)',
  ]
  const APPROVE_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
  ]

  const legs = (spender: Address = ARB_BRIDGE): EvmTxActionStep[] => [
    {
      action: ActionType.DEPOSIT,
      txParams: {
        chainId: EXTENDED_DEPOSIT_COLLATERAL.chainId,
        to: EXTENDED_DEPOSIT_COLLATERAL.address,
        functionName: 'approve',
        args: [spender, AMOUNT],
        abi: APPROVE_ABI,
      },
    },
    {
      action: ActionType.DEPOSIT,
      txParams: {
        chainId: EXTENDED_DEPOSIT_COLLATERAL.chainId,
        to: ARB_BRIDGE,
        functionName: 'depositWithId',
        args: [EXTENDED_DEPOSIT_COLLATERAL.address, AMOUNT, '0'],
        abi: DEPOSIT_ABI,
      },
    },
  ]

  /** A wallet whose node accepts and mines every transaction. */
  function wallet(chain: Chain = arbitrum) {
    const sent: { to: string; data: Hex }[] = []
    const request = async ({
      method,
      params,
    }: {
      method: string
      params?: unknown
    }) => {
      switch (method) {
        case 'eth_chainId':
          return `0x${arbitrum.id.toString(16)}`
        case 'eth_sendTransaction': {
          const [tx] = params as [{ to: string; data: Hex }]
          sent.push(tx)
          return `0x${sent.length.toString(16).padStart(64, '0')}`
        }
        case 'eth_getTransactionReceipt': {
          const [hash] = params as [Hex]
          return {
            transactionHash: hash,
            status: '0x1',
            blockNumber: '0x10',
            blockHash: `0x${'ab'.repeat(32)}`,
            logs: [],
            cumulativeGasUsed: '0x0',
            gasUsed: '0x0',
            effectiveGasPrice: '0x0',
            transactionIndex: '0x0',
            type: '0x2',
            from: ADDRESS,
            to: ARB_BRIDGE,
            contractAddress: null,
            logsBloom: `0x${'00'.repeat(256)}`,
          }
        }
        case 'eth_blockNumber':
          return '0x10'
        default:
          throw new Error(`Unexpected RPC method ${method}`)
      }
    }
    return {
      sent,
      client: createWalletClient({
        account: ADDRESS,
        chain,
        transport: custom({ request }),
      }),
    }
  }

  const bridgeRoutes = {
    'GET /api/v1/user/bridge/config': {
      chains: [{ chain: 'ARB', contractAddress: ARB_BRIDGE }],
    },
    'GET /api/v1/user/bridge/quote': { id: QUOTE_ID, fee: '0.01' },
    'POST /api/v1/user/bridge/quote': null,
  }

  it('approves, commits a quote, and deposits with the quote id as the commitment', async () => {
    const { fetchImpl, calls } = venue(bridgeRoutes)
    const { client, sent } = wallet()
    const onProgress = vi.fn()

    const result = await extendedSignActions(
      await deps(fetchImpl),
      SigningMethod.EVM_TX,
      legs(),
      ADDRESS,
      { userWallet: client, onProgress }
    )

    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /api/v1/user/bridge/config',
      'GET /api/v1/user/bridge/quote?chainIn=ARB&chainOut=ARC&amount=20',
      `POST /api/v1/user/bridge/quote?id=${QUOTE_ID}`,
    ])
    expect(
      decodeFunctionData({ abi: parseAbi(DEPOSIT_ABI), data: sent[1].data })
        .args
    ).toEqual([
      EXTENDED_DEPOSIT_COLLATERAL.address,
      20_000_000n,
      BigInt(`0x${QUOTE_ID}`),
    ])
    expect(result.executed).toEqual([])
    expect(
      result.signed.map((leg) =>
        'txParams' in leg ? [leg.txParams.functionName, leg.txParams.args] : []
      )
    ).toEqual([
      ['approve', [ARB_BRIDGE, AMOUNT]],
      [
        'depositWithId',
        [
          EXTENDED_DEPOSIT_COLLATERAL.address,
          AMOUNT,
          BigInt(`0x${QUOTE_ID}`).toString(),
        ],
      ],
    ])
    expect(result.signed.every((leg) => 'txHash' in leg)).toBe(true)
    expect(onProgress).toHaveBeenCalledTimes(4)
  })

  it('switches the wallet chain before it commits the quote', async () => {
    const { fetchImpl, calls } = venue(bridgeRoutes)
    const arbitrumWallet = wallet()
    let callsAtSwitch: number | undefined
    const switchToChain = vi.fn(async () => {
      callsAtSwitch = calls.length
      return arbitrumWallet.client
    })

    await extendedSignActions(
      await deps(fetchImpl),
      SigningMethod.EVM_TX,
      legs().slice(1),
      ADDRESS,
      { userWallet: wallet(mainnet).client, switchToChain }
    )

    // Only the bridge config is read before the switch.
    expect(callsAtSwitch).toBe(1)
    expect(calls).toHaveLength(3)
    expect(arbitrumWallet.sent).toHaveLength(1)
  })

  it.each([
    ['without a contract address', { chains: [{ chain: 'ARB' }] }],
    [
      'with a contract that is not an address',
      { chains: [{ chain: 'ARB', contractAddress: '0x1234' }] },
    ],
    ['without chains', {}],
  ])('refuses a bridge config %s before the wallet signs', async (_label, config) => {
    const { fetchImpl } = venue({
      ...bridgeRoutes,
      'GET /api/v1/user/bridge/config': config,
    })
    const { client, sent } = wallet()

    await expect(
      extendedSignActions(
        await deps(fetchImpl),
        SigningMethod.EVM_TX,
        legs(),
        ADDRESS,
        { userWallet: client }
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(sent).toEqual([])
  })

  it('reports a refused API key on the bridge config as Failed with Unauthorized', async () => {
    const { fetchImpl } = venue({
      ...bridgeRoutes,
      'GET /api/v1/user/bridge/config': refused(401),
    })
    const { client, sent } = wallet()

    const result = await extendedSignActions(
      await deps(fetchImpl),
      SigningMethod.EVM_TX,
      legs(),
      ADDRESS,
      { userWallet: client }
    )

    expect(result).toEqual({
      signed: [],
      executed: [
        expect.objectContaining({
          action: ActionType.DEPOSIT,
          status: UserActionStatus.Failed,
          errorCode: PerpsErrorCode.Unauthorized,
        }),
      ],
    })
    expect(sent).toEqual([])
  })

  it('reports a refused quote after the approval as Failed, sending no deposit', async () => {
    const { fetchImpl } = venue({
      ...bridgeRoutes,
      'GET /api/v1/user/bridge/quote': refused(400),
    })
    const { client, sent } = wallet()

    const result = await extendedSignActions(
      await deps(fetchImpl),
      SigningMethod.EVM_TX,
      legs(),
      ADDRESS,
      { userWallet: client }
    )

    expect(result.executed).toEqual([
      expect.objectContaining({ status: UserActionStatus.Accepted }),
      expect.objectContaining({
        status: UserActionStatus.Failed,
        errorCode: PerpsErrorCode.ExchangeRejected,
      }),
    ])
    expect(sent).toHaveLength(1)
  })

  it('refuses a quote with a fee above the limit, keeping the approval in the error', async () => {
    const { fetchImpl, calls } = venue({
      ...bridgeRoutes,
      'GET /api/v1/user/bridge/quote': { id: QUOTE_ID, fee: '2.5' },
    })
    const { client, sent } = wallet()

    const error = await extendedSignActions(
      await deps(fetchImpl),
      SigningMethod.EVM_TX,
      legs(),
      ADDRESS,
      { userWallet: client }
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(PerpsExecutionError)
    expect(error).toMatchObject({
      code: PerpsErrorCode.SDKError,
      response: {
        results: [
          expect.objectContaining({ status: UserActionStatus.Accepted }),
        ],
      },
    })
    expect(calls.map(({ method }) => method)).toEqual(['GET', 'GET'])
    expect(sent).toHaveLength(1)
  })

  it('refuses an approval to another spender before the wallet signs', async () => {
    const { fetchImpl } = venue(bridgeRoutes)
    const { client, sent } = wallet()

    await expect(
      extendedSignActions(
        await deps(fetchImpl),
        SigningMethod.EVM_TX,
        legs('0x000000000000000000000000000000000000dEaD'),
        ADDRESS,
        { userWallet: client }
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(sent).toEqual([])
  })
})
