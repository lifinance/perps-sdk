import { buildFill, createPerpsClient } from '@lifi/perps-sdk'
import {
  type Fill,
  FillClassification,
  LiquidityRole,
  OrderSide,
} from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HL_MARKETS } from '../../test/fixtures.js'
import {
  installInfoFetchMock,
  type RecordedRequest,
} from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { fetchFillLeverages } from './fillLeverages.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const ctx = {
  client: createPerpsClient({ integrator: 'test', apiKey: 'k', retry: false }),
  apiUrl: DEFAULT_HYPERLIQUID_API_URL,
}

const [BTC, ETH] = HL_MARKETS

const fillOn = (
  market: (typeof HL_MARKETS)[number],
  startPosition: string
): Fill =>
  buildFill(
    {
      id: `${market.id}-${startPosition}`,
      orderId: '1',
      market,
      side: OrderSide.SELL,
      size: '1',
      price: '110',
      liquidity: LiquidityRole.TAKER,
      realizedPnl: '10',
      startPosition,
      classification:
        startPosition === '0'
          ? FillClassification.OPENED_SHORT
          : FillClassification.CLOSED_LONG,
      createdAt: '2026-11-12T00:00:00.000Z',
    },
    undefined
  )

const leverageOf = (value: number) => (body: Record<string, unknown>) => ({
  user: body.user,
  coin: body.coin,
  leverage: { type: 'isolated', value },
  maxTradeSzs: ['1.0', '1.0'],
  availableToTrade: ['100.0', '100.0'],
  markPx: '110.0',
})

describe('fetchFillLeverages', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
    vi.restoreAllMocks()
  })

  it('reads the leverage once for each market of a closing fill', async () => {
    let requests: RecordedRequest[]
    ;({ restore, requests } = installInfoFetchMock(
      { activeAssetData: leverageOf(7) },
      HL_MARKETS
    ))

    const leverages = await fetchFillLeverages(ctx, ADDRESS, [
      fillOn(BTC, '1'),
      fillOn(BTC, '2'),
      fillOn(ETH, '0'),
    ])

    expect([...leverages]).toEqual([['BTC', '7']])
    expect(
      requests
        .filter(({ body }) => body.type === 'activeAssetData')
        .map(({ body }) => body.coin)
    ).toEqual(['BTC'])
  })

  it('leaves out a market whose read fails and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      {
        activeAssetData: (body: Record<string, unknown>) =>
          body.coin === 'ETH'
            ? new Response('{}', { status: 500 })
            : leverageOf(3)(body),
      },
      HL_MARKETS
    ))

    const leverages = await fetchFillLeverages(ctx, ADDRESS, [
      fillOn(BTC, '1'),
      fillOn(ETH, '1'),
    ])

    expect([...leverages]).toEqual([['BTC', '3']])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "[hyperliquid] leverage read failed for market 'ETH'"
      )
    )
  })

  it('rejects when the signal aborts', async () => {
    ;({ restore } = installInfoFetchMock(
      { activeAssetData: leverageOf(3) },
      HL_MARKETS
    ))
    const controller = new AbortController()
    controller.abort(new Error('stopped'))

    await expect(
      fetchFillLeverages(ctx, ADDRESS, [fillOn(BTC, '1')], {
        signal: controller.signal,
      })
    ).rejects.toThrow('stopped')
  })
})
