import { createPerpsClient } from '@lifi/perps-sdk'
import { OrderStatus, OrderType, PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HL_MARKETS,
  HL_ORDER_DETAIL_FOUND,
  HL_ORDER_STATUS_FOUND,
  HL_ORDER_STATUS_FOUND_WITH_CLOID,
  HL_ORDER_STATUS_OUTCOME,
  HL_ORDER_STATUS_UNKNOWN,
  HL_TWAP_HISTORY_FINISHED,
  HL_TWAP_LONG_ACTIVATED,
  HL_TWAP_LONG_SLICE_FILLS,
  HL_TWAP_SLICE_FILLS,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getOrder } from './getOrder.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})

const baseResponses = {}

const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

const CLOID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const explorerTx = (hash: string, cloids: string[]) => ({
  time: 1_704_067_200_000,
  user: ADDRESS,
  action: { type: 'order', orders: cloids.map((c) => ({ a: 0, b: true, c })) },
  block: 100,
  hash,
  error: null,
})

describe('getOrder', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('normalises a found order and enriches its asset display fields', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        orderStatus: HL_ORDER_STATUS_FOUND,
      },
      HL_MARKETS
    ))

    const order = await getOrder(ctx, {
      address: ADDRESS,
      id: '1',
    })

    expect(order.orderId).toBe('1')
    expect(order.market.categoryId).toBe('hyperliquid')
    expect(order.market.quoteAsset.displaySymbol).toBe('USDC')
    expect(order).toMatchObject({
      type: OrderType.LIMIT,
      status: OrderStatus.FILLED,
      originalSize: '0.05',
      remainingSize: '0',
      filledSize: '0.05',
      updatedAt: '2024-01-01T00:00:01.000Z',
    })
  })

  it('throws OrderNotFound when the upstream status is unknownOid', async () => {
    ;({ restore } = installInfoFetchMock({
      ...baseResponses,
      orderStatus: HL_ORDER_STATUS_UNKNOWN,
      twapHistory: [],
    }))

    await expect(
      getOrder(ctx, {
        address: ADDRESS,
        id: '7',
      })
    ).rejects.toMatchObject({ code: PerpsErrorCode.OrderNotFound })
  })

  it('throws OrderNotFound when the venue row has an invalid size', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        orderStatus: {
          ...HL_ORDER_STATUS_FOUND,
          order: {
            ...HL_ORDER_DETAIL_FOUND,
            order: { ...HL_ORDER_DETAIL_FOUND.order, origSz: 'bad-size' },
          },
        },
      },
      HL_MARKETS
    ))

    await expect(
      getOrder(ctx, { address: ADDRESS, id: '1' })
    ).rejects.toMatchObject({ code: PerpsErrorCode.OrderNotFound })
    warn.mockRestore()
  })

  it('throws OrderNotFound when the order is on an outcome market', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        orderStatus: HL_ORDER_STATUS_OUTCOME,
      },
      HL_MARKETS
    ))

    await expect(
      getOrder(ctx, {
        address: ADDRESS,
        id: '1',
      })
    ).rejects.toMatchObject({ code: PerpsErrorCode.OrderNotFound })
  })

  it('rejects non-numeric ids with a validation error before calling the venue', async () => {
    ;({ restore } = installInfoFetchMock({
      ...baseResponses,
      orderStatus: HL_ORDER_STATUS_UNKNOWN,
    }))

    await expect(
      getOrder(ctx, {
        address: ADDRESS,
        id: 'abc',
      })
    ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
  })

  it('preserves a client id in the orderStatus request and returns the venue id', async () => {
    const id = '0x1234567890abcdef1234567890abcdef'
    const installed = installInfoFetchMock(
      { orderStatus: HL_ORDER_STATUS_FOUND },
      HL_MARKETS
    )
    restore = installed.restore
    expect((await getOrder(ctx, { address: ADDRESS, id })).orderId).toBe('1')
    expect(
      installed.requests.find(({ body }) => body.type === 'orderStatus')?.body
        .oid
    ).toBe(id)
  })

  it('reads a TWAP by venue id after an unknownOid response', async () => {
    const installed = installInfoFetchMock(
      {
        orderStatus: HL_ORDER_STATUS_UNKNOWN,
        twapHistory: [
          {
            twapId: 44,
            time: 1704067200,
            status: { status: 'activated' },
            state: {
              coin: 'BTC',
              executedNtl: '0',
              executedSz: '0',
              minutes: 5,
              side: 'B',
              sz: '1',
              timestamp: 1704067200000,
              reduceOnly: false,
            },
          },
        ],
        userTwapSliceFills: [],
      },
      HL_MARKETS
    )
    restore = installed.restore
    expect(await getOrder(ctx, { address: ADDRESS, id: '44' })).toMatchObject({
      orderId: '44',
      type: OrderType.TWAP,
      status: OrderStatus.OPEN,
      durationSeconds: 300,
    })
  })

  it('reads a TWAP from its newest twapHistory row', async () => {
    const installed = installInfoFetchMock(
      {
        orderStatus: HL_ORDER_STATUS_UNKNOWN,
        twapHistory: [...HL_TWAP_HISTORY_FINISHED].reverse(),
      },
      HL_MARKETS
    )
    restore = installed.restore
    expect(
      await getOrder(ctx, { address: ADDRESS, id: '2329352' })
    ).toMatchObject({
      orderId: '2329352',
      status: OrderStatus.FILLED,
      filledSize: '0.042',
    })
    expect(installed.requests.map(({ body }) => body.type)).toEqual([
      'preTransferCheck',
      'orderStatus',
      'twapHistory',
    ])
  })

  it('reads a running TWAP from the slice fills of its twapId', async () => {
    const [, activated] = HL_TWAP_HISTORY_FINISHED
    const installed = installInfoFetchMock(
      {
        orderStatus: HL_ORDER_STATUS_UNKNOWN,
        twapHistory: [activated],
        userTwapSliceFills: HL_TWAP_SLICE_FILLS,
      },
      HL_MARKETS
    )
    restore = installed.restore
    expect(
      await getOrder(ctx, { address: ADDRESS, id: '2329352' })
    ).toMatchObject({
      orderId: '2329352',
      type: OrderType.TWAP,
      status: OrderStatus.PARTIALLY_FILLED,
      originalSize: '0.042',
      filledSize: '0.0094',
      remainingSize: '0.0326',
      averagePrice: '3991',
    })
    expect(installed.requests.map(({ body }) => body)).toContainEqual({
      type: 'userTwapSliceFills',
      user: ADDRESS,
    })
  })

  it('reads a running TWAP from all of its slice fills when the slice-fill window is full', async () => {
    const window = HL_TWAP_LONG_SLICE_FILLS.slice(-2000).reverse()
    const installed = installInfoFetchMock(
      {
        orderStatus: HL_ORDER_STATUS_UNKNOWN,
        twapHistory: [HL_TWAP_LONG_ACTIVATED],
        userTwapSliceFills: window,
        userTwapSliceFillsByTime: HL_TWAP_LONG_SLICE_FILLS.slice(0, 1001),
      },
      HL_MARKETS
    )
    restore = installed.restore

    expect(
      await getOrder(ctx, { address: ADDRESS, id: '2329400' })
    ).toMatchObject({
      orderId: '2329400',
      status: OrderStatus.PARTIALLY_FILLED,
      filledSize: '30',
      remainingSize: '10',
      averagePrice: '120',
    })
    expect(installed.requests.map(({ body }) => body)).toContainEqual({
      type: 'userTwapSliceFillsByTime',
      user: ADDRESS,
      startTime: HL_TWAP_LONG_ACTIVATED.state.timestamp,
      endTime: window[window.length - 1].fill.time,
    })
  })

  it('rejects a running TWAP read when its slice-fill request fails', async () => {
    const [, activated] = HL_TWAP_HISTORY_FINISHED
    const installed = installInfoFetchMock(
      {
        orderStatus: HL_ORDER_STATUS_UNKNOWN,
        twapHistory: [activated],
        userTwapSliceFills: new Response('{}', { status: 503 }),
      },
      HL_MARKETS
    )
    restore = installed.restore

    await expect(
      getOrder(ctx, { address: ADDRESS, id: '2329352' })
    ).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
      tool: 'hyperliquid',
    })
  })

  it('reads a fully executed TWAP as filled before its finished history row arrives', async () => {
    const [, activated] = HL_TWAP_HISTORY_FINISHED
    const installed = installInfoFetchMock(
      {
        orderStatus: HL_ORDER_STATUS_UNKNOWN,
        twapHistory: [activated],
        userTwapSliceFills: [
          {
            ...HL_TWAP_SLICE_FILLS[0],
            fill: {
              ...HL_TWAP_SLICE_FILLS[0].fill,
              sz: '0.042',
              px: '4000',
            },
          },
        ],
      },
      HL_MARKETS
    )
    restore = installed.restore

    expect(
      await getOrder(ctx, { address: ADDRESS, id: '2329352' })
    ).toMatchObject({
      orderId: '2329352',
      status: OrderStatus.FILLED,
      filledSize: '0.042',
      remainingSize: '0',
      averagePrice: '4000',
    })
  })

  it('sets explorerLink from the placement transaction that names the cloid', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        orderStatus: HL_ORDER_STATUS_FOUND_WITH_CLOID,
        userDetails: {
          txs: [
            explorerTx('0xunrelated', ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']),
            explorerTx('0xplacement', [CLOID]),
          ],
        },
      },
      HL_MARKETS
    ))
    expect(await getOrder(ctx, { address: ADDRESS, id: '1' })).toMatchObject({
      orderId: '1',
      clientOrderId: CLOID,
      explorerLink: 'https://app.hyperliquid.xyz/explorer/tx/0xplacement',
    })
  })

  it('makes no explorer read when the order carries no client order id', async () => {
    const installed = installInfoFetchMock(
      { orderStatus: HL_ORDER_STATUS_FOUND },
      HL_MARKETS
    )
    restore = installed.restore
    const order = await getOrder(ctx, { address: ADDRESS, id: '1' })
    expect(
      installed.requests.filter(
        (request) => request.body.type === 'userDetails'
      )
    ).toHaveLength(0)
    expect(order).not.toHaveProperty('explorerLink')
  })

  it('returns the order unlinked when the explorer read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      {
        orderStatus: HL_ORDER_STATUS_FOUND_WITH_CLOID,
        userDetails: new Response('{}', { status: 503 }),
      },
      HL_MARKETS
    ))
    const order = await getOrder(ctx, { address: ADDRESS, id: '1' })
    expect(order).toMatchObject({ orderId: '1', clientOrderId: CLOID })
    expect(order).not.toHaveProperty('explorerLink')
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      '[hyperliquid] explorer link lookup failed: Hyperliquid explorer userDetails failed: 503',
    ])
    warn.mockRestore()
  })

  it('rejects when the caller signal times out during the explorer read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      { orderStatus: HL_ORDER_STATUS_FOUND_WITH_CLOID },
      HL_MARKETS
    ))
    const controller = new AbortController()
    const fetchMock = vi.mocked(globalThis.fetch)
    const serve = fetchMock.getMockImplementation()
    if (serve === undefined) {
      throw new Error('installInfoFetchMock installed no implementation')
    }
    fetchMock.mockImplementation(async (input, init) => {
      if (String(init?.body).includes('userDetails')) {
        controller.abort(new DOMException('signal timed out', 'TimeoutError'))
        throw controller.signal.reason
      }
      return serve(input, init)
    })
    await expect(
      getOrder(
        ctx,
        { address: ADDRESS, id: '1' },
        { signal: controller.signal }
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.ServerError })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
