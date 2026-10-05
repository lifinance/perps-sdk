import { createPerpsClient } from '@lifi/perps-sdk'
import type { AccountSummary } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAccountSummary } from './accountSummary.js'
import { lighterProvider, lighterRhProvider } from './LighterProvider.js'
import { LighterWsProvider } from './websocket/LighterWsProvider.js'

const { Socket } = vi.hoisted(() => {
  class Socket {
    static OPEN = 1
    static instances: Socket[] = []
    readyState = 0
    retryCount = 0
    onopen: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    constructor() {
      Socket.instances.push(this)
    }
    send() {}
    close() {
      this.readyState = 3
    }
    open() {
      this.readyState = Socket.OPEN
      this.onopen?.()
    }
    receive(frame: unknown) {
      this.onmessage?.({ data: JSON.stringify(frame) })
    }
  }
  return { Socket }
})

vi.mock('../../perps-sdk/node_modules/partysocket/dist/ws.js', () => ({
  default: Socket,
}))

const ADDRESS = '0xd98709bcA99706256E7ADecE222E3da0f1ADAfEe' as const
const EQUITY = '13.891825'
const asset = (
  asset_id: number,
  symbol: string,
  balance: string,
  margin_balance: string
) => ({
  asset_id,
  symbol,
  balance,
  margin_balance,
  locked_balance: '0',
  margin_mode: 'enabled',
  multiplier: '1',
})
// Account 12's public REST holdings, recorded 2026-10-01; marks are deterministic.
const holdings = (settlement: string, collateralBalance: string) => [
  asset(1, 'ETH', '0', '0.00709091'),
  asset(2, 'LIT', '8.00004674', '0'),
  asset(3, settlement, collateralBalance, '13.89182545205'),
]
const respond = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })

function setup(
  providerId: 'lighter' | 'lighter-rh' = 'lighter',
  collateralBalance = '0'
) {
  const settlement = providerId === 'lighter' ? 'USDC' : 'USDG'
  const descriptor = (id: string, displaySymbol: string) => ({
    providerId,
    id,
    displaySymbol,
    logoURI: '',
  })
  const assets = holdings(settlement, collateralBalance)
  const quoteAsset = descriptor(settlement, settlement)
  const markets = [
    { id: '2048', baseAsset: descriptor('1', 'ETH') },
    { id: '2049', baseAsset: descriptor('2', 'LIT') },
  ].map((market) => ({ ...market, providerId, categoryId: 'spot', quoteAsset }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/marketsContext')) {
        return respond({
          prices: [
            { marketId: '2048', midPrice: '2000', markPrice: '2000' },
            { marketId: '2049', midPrice: '1', markPrice: '1' },
          ],
        })
      }
      if (url.includes('/markets')) {
        return respond({ markets })
      }
      if (url.includes('/assets')) {
        return respond({
          assets: assets.map((a) => descriptor(String(a.asset_id), a.symbol)),
        })
      }
      if (url.includes('/providers')) {
        return respond({
          providers: [
            {
              key: providerId,
              categories: [
                { id: 'perps', quoteAsset },
                { id: 'spot', quoteAsset: null },
              ],
            },
          ],
        })
      }
      if (url.includes('/api/v1/account?')) {
        return respond({
          code: 200,
          total: 1,
          accounts: [
            {
              code: 0,
              account_type: 0,
              index: 12,
              l1_address: ADDRESS,
              cancel_all_time: 0,
              total_order_count: 0,
              total_isolated_order_count: 0,
              pending_order_count: 0,
              available_balance: EQUITY,
              status: 1,
              collateral: EQUITY,
              transaction_time: 0,
              account_trading_mode: 1,
              account_index: 12,
              name: '',
              description: '',
              positions: [],
              assets,
              total_asset_value: EQUITY,
              cross_asset_value: EQUITY,
              cross_initial_margin_requirement: '0',
            },
          ],
        })
      }
      if (url.includes('/api/v1/accountLimits')) {
        return respond({
          code: 0,
          max_llp_percentage: 0,
          max_llp_amount: '0',
          user_tier: 'STANDARD',
          can_create_public_pool: false,
          current_maker_fee_tick: 100,
          current_taker_fee_tick: 280,
          leased_lit: '0',
          effective_lit_stakes: '0',
        })
      }
      if (url.includes('/api/v1/pnl')) {
        const entry = {
          trade_pnl: 0,
          inflow: 0,
          outflow: 0,
          pool_pnl: 0,
          pool_inflow: 0,
          pool_outflow: 0,
          pool_total_shares: 0,
          spot_inflow: 0,
          spot_outflow: 0,
          staked_lit: 0,
          staking_inflow: 0,
          staking_outflow: 0,
          staking_pnl: 0,
          trade_spot_pnl: 0,
          volume: 0,
        }
        return respond({
          code: 200,
          resolution: '1h',
          pnl: [
            { ...entry, timestamp: 1_741_000_000 },
            { ...entry, timestamp: 1_741_003_600, trade_pnl: 2 },
          ],
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
  )
  const provider =
    providerId === 'lighter' ? lighterProvider() : lighterRhProvider()
  const client = createPerpsClient({
    integrator: 'test',
    apiKey: 'test',
    apiUrl: 'https://backend.test/v1/perps',
    providers: [provider],
  })
  return { provider, client, assets }
}

const streams: LighterWsProvider[] = []
afterEach(() => {
  for (const stream of streams) {
    stream.close()
  }
  streams.length = 0
  Socket.instances.length = 0
  vi.unstubAllGlobals()
})

async function subscribe(authenticated = false, collateralBalance = '0') {
  const { client, assets } = setup('lighter', collateralBalance)
  const stream = new LighterWsProvider(
    'ws://test',
    'lighter',
    authenticated ? { resolveAuthToken: async () => 'test-token' } : {},
    client
  )
  streams.push(stream)
  const socket = Socket.instances.at(-1)!
  socket.open()
  const summaries: AccountSummary[] = []
  await stream.subscribe(
    { channel: 'accountSummary', dex: 'lighter', address: ADDRESS },
    (event) => {
      if (event.channel === 'accountSummary') {
        summaries.push(event.data)
      }
    }
  )
  const channel = authenticated ? 'account_all_assets' : 'account_all'
  const sendAssets = (rows: unknown[], snapshot = false) =>
    socket.receive({
      type: `${snapshot ? 'subscribed' : 'update'}/${channel}`,
      channel: `${channel}:12`,
      assets: Object.fromEntries(rows.map((row, i) => [String(i), row])),
    })
  const mark = (eth: string) =>
    socket.receive({
      type: 'update/spot_market_stats',
      spot_market_stats: Object.fromEntries(
        [
          ['2048', 'ETH', eth],
          ['2049', 'LIT', '1'],
        ].map(([id, symbol, price]) => [
          id,
          {
            market_id: Number(id),
            symbol: `${symbol}/USDC`,
            index_price: price,
            mid_price: price,
            best_ask_price: price,
            best_bid_price: price,
            last_trade_price: price,
            daily_base_token_volume: 0,
            daily_quote_token_volume: 0,
            daily_price_low: 0,
            daily_price_high: 0,
            daily_price_change: 0,
          },
        ])
      ),
    })
  socket.receive({
    type: 'update/user_stats',
    channel: 'user_stats:12',
    stats: {
      collateral: EQUITY,
      portfolio_value: EQUITY,
      available_balance: EQUITY,
    },
  })
  mark('2000')
  return { summaries, sendAssets, mark, assets }
}

describe('Lighter non-settlement margin holdings', () => {
  it.each([
    'lighter',
    'lighter-rh',
  ] as const)('includes margin-route holdings without recounting %s settlement equity', async (providerId) => {
    const { provider } = setup(providerId)
    const account = await provider.getAccount({ address: ADDRESS })
    expect(getAccountSummary(account, []).portfolioValue).toBe('36.07369174')
    expect(getAccountSummary(account, []).availableMargin).toBe(EQUITY)
  })

  it('anchors portfolio history to spot plus non-settlement margin holdings', async () => {
    const { provider } = setup()
    const history = await provider.getPortfolioHistory!(
      { address: ADDRESS, range: '24h' },
      { lighterAuthToken: 'test-token' }
    )
    expect(history.points).toEqual([
      { timestamp: 1_741_000_000_000, accountValue: '34.07369174', pnl: '0' },
      { timestamp: 1_741_003_600_000, accountValue: '36.07369174', pnl: '2' },
    ])
  })

  it.each([
    false,
    true,
  ])('values margin holdings from websocket snapshots (authenticated %s)', async (authenticated) => {
    const { summaries, sendAssets, assets } = await subscribe(authenticated)
    sendAssets(assets, true)
    expect(summaries.at(-1)?.portfolioValue).toBe('36.07369174')
  })

  it('revalues margin-only holdings when their spot mark changes', async () => {
    const { summaries, sendAssets, mark, assets } = await subscribe()
    sendAssets(assets, true)
    mark('3000')
    expect(summaries.at(-1)?.portfolioValue).toBe('43.16460174')
  })

  it('upserts both routes and removes zeroed margin holdings in deltas', async () => {
    const { summaries, sendAssets, assets } = await subscribe()
    sendAssets(assets, true)
    sendAssets([asset(1, 'ETH', '0.001', '0.01')])
    expect(summaries.at(-1)?.portfolioValue).toBe('43.89187174')
    sendAssets([asset(1, 'ETH', '0.001', '0')])
    expect(summaries.at(-1)?.portfolioValue).toBe('23.89187174')
    sendAssets([asset(3, 'USDC', '2', '90')])
    expect(summaries.at(-1)?.portfolioValue).toBe('25.89187174')
  })

  it('replaces margin holdings on a new snapshot rather than retaining stale quantities', async () => {
    const { summaries, sendAssets, assets } = await subscribe()
    sendAssets(assets, true)
    sendAssets([asset(1, 'ETH', '0', '0.002')], true)
    expect(summaries.at(-1)?.portfolioValue).toBe('17.891825')
  })

  it('values a unified spot-route settlement balance once over REST and websocket', async () => {
    const { provider } = setup('lighter', '2')
    const account = await provider.getAccount({ address: ADDRESS })
    expect(getAccountSummary(account, []).portfolioValue).toBe('38.07369174')

    const { summaries, sendAssets, assets } = await subscribe(false, '2')
    sendAssets(assets, true)
    expect(summaries.at(-1)?.portfolioValue).toBe('38.07369174')
  })
})
