import type { PerpsSDKClient } from '@lifi/perps-sdk'
import type { AccountSummary } from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccountSummary } from '../accountSummary.js'
import { lighterProvider } from '../LighterProvider.js'
import { LighterWsProvider } from './LighterWsProvider.js'

// Spot-holding account shaped like account 690490: USDC (the settlement
// asset, with a perps-route margin balance that portfolioValue never adds),
// ETH and LIT priced by spot markets, and XYZ that no spot market prices.
const ADDRESS = '0x00000000000000000000000000000000000a8a0a' as const
const ACCOUNT_INDEX = 690490

const USDC = 3
const ETH = 1
const LIT = 2
const XYZ = 5

const asset = (
  symbol: string,
  assetId: number,
  balance: string,
  marginBalance = '0'
) => ({
  symbol,
  asset_id: assetId,
  balance,
  locked_balance: '0',
  margin_mode: 'disabled' as const,
  margin_balance: marginBalance,
  multiplier: '1',
})

const ASSETS = [
  asset('USDC', USDC, '50.25', '100'),
  asset('ETH', ETH, '0.0125'),
  asset('LIT', LIT, '40'),
  asset('XYZ', XYZ, '7'),
]

const SPOT_MARKS = [
  { marketId: '2048', assetId: ETH, symbol: 'ETH', mid: '2500.5' },
  { marketId: '2049', assetId: LIT, symbol: 'LIT', mid: '1.8125' },
]

const accountPayload = (totalAssetValue: string) => ({
  code: 200,
  total: 1,
  accounts: [
    {
      code: 0,
      account_type: 0,
      index: ACCOUNT_INDEX,
      l1_address: ADDRESS,
      cancel_all_time: 0,
      total_order_count: 0,
      total_isolated_order_count: 0,
      pending_order_count: 0,
      available_balance: totalAssetValue,
      status: 1,
      collateral: totalAssetValue,
      transaction_time: 0,
      account_trading_mode: 0,
      account_index: ACCOUNT_INDEX,
      name: '',
      description: '',
      positions: [],
      assets: ASSETS,
      total_asset_value: totalAssetValue,
      cross_asset_value: totalAssetValue,
      cross_initial_margin_requirement: '0',
    },
  ],
})

const lighterAsset = (id: number | string, displaySymbol: string) => ({
  providerId: 'lighter',
  id: String(id),
  displaySymbol,
  logoURI: '',
})

const MARKETS_RESPONSE = {
  markets: SPOT_MARKS.map((m) => ({
    providerId: 'lighter',
    id: m.marketId,
    categoryId: 'spot',
    baseAsset: lighterAsset(m.assetId, m.symbol),
    quoteAsset: lighterAsset('USDC', 'USDC'),
  })),
}

const MARKETS_CONTEXT_RESPONSE = {
  prices: SPOT_MARKS.map((m) => ({
    marketId: m.marketId,
    midPrice: m.mid,
    markPrice: m.mid,
  })),
}

const providersResponse = (spotCategoryId: string) => ({
  providers: [
    {
      key: 'lighter',
      categories: [
        { id: 'perps', quoteAsset: lighterAsset('USDC', 'USDC') },
        { id: spotCategoryId, quoteAsset: null },
      ],
    },
  ],
})

const ASSETS_RESPONSE = {
  assets: ASSETS.map((a) => lighterAsset(a.asset_id, a.symbol)),
}

const respond = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const stubFetch = (totalAssetValue: string, providersSpotCategoryId = 'spot') =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/marketsContext')) {
        return respond(MARKETS_CONTEXT_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/assets')) {
        return respond(ASSETS_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/providers')) {
        return respond(providersResponse(providersSpotCategoryId))
      }
      if (u.includes('/api/v1/account?')) {
        return respond(accountPayload(totalAssetValue))
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })
  )

type WsInternals = {
  accountIndexCache: Map<string, number>
  rws: {
    ready(): Promise<void>
    getStatus(): string
    send(data: string): void
  }
  handleMessage(raw: string): void
}

type Frame = 'spot_marks' | 'account_all' | 'user_stats'

const FRAME_ORDERS: ReadonlyArray<readonly Frame[]> = [
  ['spot_marks', 'account_all', 'user_stats'],
  ['spot_marks', 'user_stats', 'account_all'],
  ['account_all', 'spot_marks', 'user_stats'],
  ['account_all', 'user_stats', 'spot_marks'],
  ['user_stats', 'spot_marks', 'account_all'],
  ['user_stats', 'account_all', 'spot_marks'],
]

const restPortfolioValue = async (client: PerpsSDKClient) => {
  const provider = lighterProvider()
  provider.bind(client)
  const account = await provider.getAccount({ address: ADDRESS })
  const { positions } = await provider.getPositions({ address: ADDRESS })
  return getAccountSummary(account, positions).portfolioValue
}

const streamedSummaries = async (
  client: PerpsSDKClient,
  totalAssetValue: string,
  order: readonly Frame[]
): Promise<AccountSummary[]> => {
  const ws = new LighterWsProvider('ws://127.0.0.1:1', 'lighter', {}, client)
  const internals = ws as unknown as WsInternals
  internals.accountIndexCache.set(ADDRESS.toLowerCase(), ACCOUNT_INDEX)
  internals.rws.ready = vi.fn().mockResolvedValue(undefined)
  internals.rws.getStatus = () => 'connected'
  internals.rws.send = vi.fn()
  const listener = vi.fn()
  await ws.subscribe(
    { channel: 'accountSummary', dex: 'lighter', address: ADDRESS },
    listener
  )

  const frames: Record<Frame, string> = {
    spot_marks: JSON.stringify({
      type: 'update/spot_market_stats',
      spot_market_stats: Object.fromEntries(
        SPOT_MARKS.map((m) => [
          m.marketId,
          {
            market_id: Number(m.marketId),
            symbol: `${m.symbol}/USDC`,
            index_price: m.mid,
            mid_price: m.mid,
            last_trade_price: m.mid,
            daily_base_token_volume: 0,
            daily_quote_token_volume: 0,
            daily_price_low: 0,
            daily_price_high: 0,
            daily_price_change: 0,
          },
        ])
      ),
    }),
    account_all: JSON.stringify({
      type: 'subscribed/account_all',
      channel: `account_all:${ACCOUNT_INDEX}`,
      assets: Object.fromEntries(
        ASSETS.map(({ symbol, asset_id, balance, locked_balance }) => [
          String(asset_id),
          { symbol, asset_id, balance, locked_balance },
        ])
      ),
    }),
    user_stats: JSON.stringify({
      type: 'update/user_stats',
      channel: `user_stats:${ACCOUNT_INDEX}`,
      stats: {
        collateral: totalAssetValue,
        portfolio_value: totalAssetValue,
        available_balance: totalAssetValue,
      },
    }),
  }
  for (const frame of order) {
    internals.handleMessage(frames[frame])
  }
  ws.close()
  return listener.mock.calls.map(([event]) => event.data)
}

describe('LighterWsProvider accountSummary parity with REST getAccountSummary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe.each([
    // 0 + 50.25 + 0.0125 × 2500.5 + 40 × 1.8125 + 7 × 0
    ['0', '154.00625'],
    ['12.5', '166.50625'],
  ])('with total_asset_value %s', (totalAssetValue, expected) => {
    beforeEach(() => {
      stubFetch(totalAssetValue)
    })

    it.each(
      FRAME_ORDERS.map((order) => [order.join(', '), order] as const)
    )('streams the REST portfolioValue after the frames %s', async (_label, order) => {
      const client = {
        config: { apiUrl: 'https://backend.test/v1/perps' },
        providers: [],
        getProvider: () => undefined,
      } as unknown as PerpsSDKClient

      const rest = await restPortfolioValue(client)
      const streamed = await streamedSummaries(client, totalAssetValue, order)

      expect(rest).toBe(expected)
      expect(streamed.at(-1)?.portfolioValue).toBe(rest)
    })
  })

  // Both paths price spot assets by the markets that carry
  // LIGHTER_SPOT_CATEGORY_ID, whatever the /providers null-quote category id is.
  it('streams the REST portfolioValue when /providers names a different spot category id', async () => {
    stubFetch('0', 'cash')
    const client = {
      config: { apiUrl: 'https://backend.test/v1/perps' },
    } as PerpsSDKClient

    const rest = await restPortfolioValue(client)
    const streamed = await streamedSummaries(client, '0')

    expect(rest).toBe('154.00625')
    expect(streamed).toHaveLength(1)
    expect(streamed[0].portfolioValue).toBe(rest)
  })
})
