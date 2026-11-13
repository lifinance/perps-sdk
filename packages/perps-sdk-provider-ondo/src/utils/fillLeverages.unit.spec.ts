import { buildFill } from '@lifi/perps-sdk'
import {
  type Fill,
  FillClassification,
  LiquidityRole,
  OrderSide,
} from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OndoApiClient } from './apiClient.js'
import { fetchFillLeverages } from './fillLeverages.js'

const BASE_URL = 'https://api.ondoperps-sandbox.xyz'
const MARKET = {
  providerId: 'ondo',
  id: 'AAPL-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'AAPL',
    displaySymbol: 'AAPL',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
  },
}

const fillWith = (
  classification: FillClassification,
  marketId = MARKET.id
): Fill =>
  buildFill(
    {
      id: 'fill-1',
      orderId: 'ord-1',
      market: { ...MARKET, id: marketId },
      side: OrderSide.SELL,
      size: '4',
      price: '205',
      liquidity: LiquidityRole.TAKER,
      realizedPnl: '20',
      classification,
      createdAt: '2026-07-01T12:00:00.000Z',
    },
    undefined
  )

const clientFor = (response: Response, signal?: AbortSignal) => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
  return {
    client: new OndoApiClient(BASE_URL, { fetchImpl, signal }),
    fetchImpl,
  }
}

describe('fetchFillLeverages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the leverage of the closing markets in one read', async () => {
    const { client, fetchImpl } = clientFor(
      Response.json({
        success: true,
        result: [
          { market: 'AAPL-USD.P', leverage: '5' },
          { market: 'TSLA-USD.P', leverage: '3' },
        ],
      })
    )

    const leverages = await fetchFillLeverages(client, 'jwt', [
      fillWith(FillClassification.CLOSED_LONG),
    ])

    expect([...leverages]).toEqual([['AAPL-USD.P', '5']])
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      `${BASE_URL}/v1/perps/leverage`
    )
  })

  it('reads nothing without a closing fill', async () => {
    const { client, fetchImpl } = clientFor(Response.json({}))

    const leverages = await fetchFillLeverages(client, 'jwt', [
      fillWith(FillClassification.OPENED_SHORT),
      fillWith(FillClassification.SWITCHED_SHORT),
    ])

    expect(leverages.size).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('gives an empty map and warns when the read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = clientFor(
      Response.json(
        { success: false, error: 'bad request', error_code: 'unknown' },
        { status: 400 }
      )
    )

    const leverages = await fetchFillLeverages(client, 'jwt', [
      fillWith(FillClassification.CLOSED_LONG),
    ])

    expect(leverages.size).toBe(0)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[ondo] leverage read failed')
    )
  })

  it.each([
    ['a missing row', 'NVDA-USD.P', []],
    [
      'a zero leverage',
      'META-USD.P',
      [{ market: 'META-USD.P', leverage: '0' }],
    ],
    [
      'a malformed leverage',
      'GOOG-USD.P',
      [{ market: 'GOOG-USD.P', leverage: '5x' }],
    ],
  ])('leaves out and warns for a closing market with %s', async (_case, marketId, result) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = clientFor(Response.json({ success: true, result }))

    const leverages = await fetchFillLeverages(client, 'jwt', [
      fillWith(FillClassification.CLOSED_LONG, marketId),
    ])

    expect(leverages.size).toBe(0)
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `[ondo] no positive leverage for market '${marketId}'; its fills carry no returnOnEquity`
    )
  })

  it('warns once for each closing market without a usable leverage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = clientFor(
      Response.json({
        success: true,
        result: [
          { market: 'AAPL-USD.P', leverage: '5' },
          { market: 'MSFT-USD.P', leverage: '-1' },
        ],
      })
    )

    const leverages = await fetchFillLeverages(client, 'jwt', [
      fillWith(FillClassification.CLOSED_LONG),
      fillWith(FillClassification.CLOSED_LONG, 'MSFT-USD.P'),
      fillWith(FillClassification.REDUCED_SHORT, 'AMZN-USD.P'),
    ])

    expect([...leverages]).toEqual([['AAPL-USD.P', '5']])
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      "[ondo] no positive leverage for market 'MSFT-USD.P'; its fills carry no returnOnEquity",
      "[ondo] no positive leverage for market 'AMZN-USD.P'; its fills carry no returnOnEquity",
    ])
  })

  it('rejects when the signal aborts', async () => {
    const controller = new AbortController()
    controller.abort(new Error('stopped'))
    const { client } = clientFor(Response.json({}), controller.signal)

    await expect(
      fetchFillLeverages(
        client,
        'jwt',
        [fillWith(FillClassification.CLOSED_LONG)],
        controller.signal
      )
    ).rejects.toThrow('stopped')
  })
})
