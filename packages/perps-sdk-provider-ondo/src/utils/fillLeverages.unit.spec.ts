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

const fillWith = (classification: FillClassification): Fill =>
  buildFill(
    {
      id: 'fill-1',
      orderId: 'ord-1',
      market: MARKET,
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

  it('reads every market leverage in one read for a closing fill', async () => {
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

    expect([...leverages]).toEqual([
      ['AAPL-USD.P', '5'],
      ['TSLA-USD.P', '3'],
    ])
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
