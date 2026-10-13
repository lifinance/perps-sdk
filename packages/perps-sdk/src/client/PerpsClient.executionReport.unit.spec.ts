import type {
  ActionResult,
  ActionStep,
  CreateActionResponse,
  ExecuteActionRequest,
  ExecuteActionResponse,
  SignedActionStep,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockCreateOrderResponse, server } from '../../test/handlers.js'
import {
  ActionType,
  DEFAULT_API_URL,
  OrderSide,
  OrderType,
  PerpsClient,
  PerpsError,
  PerpsErrorCode,
  PerpsExecutionError,
  type PerpsProviderPlugin,
  type SignActionsResult,
  UserActionStatus,
} from '../index.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const PROVIDER = 'hyperliquid'
const TX_HASH = `0x${'5c'.repeat(32)}`
const EXPLORER = `https://app.hyperliquid.xyz/explorer/tx/${TX_HASH}`

const orderStep = mockCreateOrderResponse.actions[0] as ActionStep
const signedOrderStep = {
  ...orderStep,
  signature: '0xsigned',
} as SignedActionStep

const ORDER = {
  address: ADDRESS,
  provider: PROVIDER,
  market: { marketId: 'BTC', categoryId: PROVIDER },
  side: OrderSide.BUY,
  type: OrderType.LIMIT,
  size: '0.01',
  price: '95000.0',
} as const

function stagedSteps(count: number): CreateActionResponse {
  return { actions: Array.from({ length: count }, () => orderStep) }
}

describe('PerpsClient execution report (public entrypoint)', () => {
  let signActions: ReturnType<
    typeof vi.fn<
      (method: unknown, steps: ActionStep[]) => Promise<SignActionsResult>
    >
  >
  let onExecuteResults: ReturnType<
    typeof vi.fn<(address: string, results: ActionResult[]) => Promise<void>>
  >
  let executeRequests: ExecuteActionRequest[]
  let client: PerpsClient

  function respond(
    staged: CreateActionResponse,
    results: ActionResult[] | (() => Response)
  ) {
    server.use(
      http.post(`${DEFAULT_API_URL}/createAction`, () =>
        HttpResponse.json(staged)
      ),
      http.post(`${DEFAULT_API_URL}/executeAction`, async ({ request }) => {
        executeRequests.push((await request.json()) as ExecuteActionRequest)
        if (typeof results === 'function') {
          return results()
        }
        return HttpResponse.json({ results } satisfies ExecuteActionResponse)
      })
    )
  }

  beforeEach(() => {
    executeRequests = []
    signActions = vi.fn(async (_method: unknown, steps: ActionStep[]) => ({
      signed: steps.map(() => signedOrderStep),
      executed: [],
    }))
    onExecuteResults = vi.fn(async () => {})
    const plugin = {
      type: PROVIDER,
      bind: vi.fn(),
      accountExists: vi.fn(async () => true),
      resolveActionRequest: vi.fn(async () => ({})),
      resolveExplorerLink: (txHash: string) =>
        `https://app.hyperliquid.xyz/explorer/tx/${txHash}`,
      signActions,
      onExecuteResults,
    } satisfies Partial<PerpsProviderPlugin> as unknown as PerpsProviderPlugin
    client = new PerpsClient({
      integrator: 'report-test',
      apiKey: 'test-key',
      providers: [plugin],
    })
  })

  it('returns every result of a mixed batch in step order, identifiers kept', async () => {
    respond(stagedSteps(3), [
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '91490942',
      },
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '91490943',
      },
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Indeterminate,
        txHash: TX_HASH,
        error: 'Hyperliquid did not answer in time',
        errorCode: PerpsErrorCode.TimeoutError,
      },
    ])

    const response = await client.placeOrder(ORDER)

    expect(response.results).toEqual([
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '91490942',
      },
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '91490943',
      },
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Indeterminate,
        txHash: TX_HASH,
        explorerLink: EXPLORER,
        error: 'Hyperliquid did not answer in time',
        errorCode: PerpsErrorCode.TimeoutError,
      },
    ])
    expect(executeRequests).toHaveLength(1)
    expect(executeRequests[0].actions).toHaveLength(3)
    expect(onExecuteResults).toHaveBeenCalledWith(ADDRESS, response.results)
  })

  it('keeps an uncertain first step as Indeterminate and submits nothing after it', async () => {
    const uncertain: ActionResult = {
      action: ActionType.PLACE_ORDER,
      status: UserActionStatus.Indeterminate,
      error: 'request sent, no answer',
      errorCode: PerpsErrorCode.ThirdPartyError,
    }
    signActions.mockResolvedValue({
      signed: [signedOrderStep],
      executed: [uncertain],
    })
    respond(stagedSteps(2), [])

    const response = await client.placeOrder(ORDER)

    expect(response.results).toEqual([uncertain])
    expect(executeRequests).toEqual([])
  })

  it('reports client-executed results before the /executeAction results', async () => {
    const executed: ActionResult = {
      action: ActionType.PLACE_ORDER,
      status: UserActionStatus.Accepted,
      txHash: TX_HASH,
    }
    signActions.mockResolvedValue({
      signed: [signedOrderStep],
      executed: [executed],
    })
    respond(stagedSteps(2), [
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '91490944',
      },
    ])

    const response = await client.placeOrder(ORDER)

    expect(response.results).toEqual([
      { ...executed, explorerLink: EXPLORER },
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '91490944',
      },
    ])
  })

  it('returns an empty report when nothing executed and nothing is signed', async () => {
    signActions.mockResolvedValue({ signed: [], executed: [] })
    respond(stagedSteps(1), [])

    await expect(client.placeOrder(ORDER)).resolves.toEqual({ results: [] })
    expect(executeRequests).toEqual([])
    expect(onExecuteResults).not.toHaveBeenCalled()
  })

  it('throws a PerpsExecutionError with the report when onExecuteResults throws', async () => {
    const results: ActionResult[] = [
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '91490945',
      },
    ]
    const hookError = new Error('credential store unavailable')
    onExecuteResults.mockRejectedValue(hookError)
    respond(stagedSteps(1), results)

    const error = await client.placeOrder(ORDER).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(PerpsExecutionError)
    const executionError = error as PerpsExecutionError
    expect(executionError.response).toEqual({ results })
    expect(executionError.cause).toBe(hookError)
    expect(executionError.code).toBe(PerpsErrorCode.SDKError)
  })

  it('keeps client-executed results when /executeAction fails, and sends it once', async () => {
    const executed: ActionResult = {
      action: ActionType.PLACE_ORDER,
      status: UserActionStatus.Accepted,
    }
    signActions.mockResolvedValue({
      signed: [signedOrderStep],
      executed: [executed],
    })
    respond(stagedSteps(2), () =>
      HttpResponse.json(
        { code: PerpsErrorCode.ServerError, message: 'upstream 503' },
        { status: 503 }
      )
    )

    const error = await client.placeOrder(ORDER).catch((e: unknown) => e)

    expect(executeRequests).toHaveLength(1)
    expect(error).toBeInstanceOf(PerpsExecutionError)
    const executionError = error as PerpsExecutionError
    expect(executionError.response).toEqual({ results: [executed] })
    expect(executionError.cause).toBeInstanceOf(PerpsError)
    expect(executionError.code).toBe((executionError.cause as PerpsError).code)
  })

  it('rethrows the original error when no result is known', async () => {
    respond(stagedSteps(1), () =>
      HttpResponse.json(
        { code: PerpsErrorCode.ServerError, message: 'upstream 503' },
        { status: 503 }
      )
    )

    const error = await client.placeOrder(ORDER).catch((e: unknown) => e)

    expect(executeRequests).toHaveLength(1)
    expect(error).toBeInstanceOf(PerpsError)
    expect(error).not.toBeInstanceOf(PerpsExecutionError)
  })

  it('rethrows a signing failure with nothing executed as the original error', async () => {
    const signingError = new PerpsError(
      PerpsErrorCode.SignatureInvalid,
      'wallet refused'
    )
    signActions.mockRejectedValue(signingError)
    respond(stagedSteps(1), [])

    await expect(client.placeOrder(ORDER)).rejects.toBe(signingError)
    expect(executeRequests).toEqual([])
  })
})
