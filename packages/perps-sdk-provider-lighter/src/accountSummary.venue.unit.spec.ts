import type { PerpsSDKClient } from '@lifi/perps-sdk'
import { PositionMarginAdjustment } from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccountSummary } from './accountSummary.js'
import { lighterProvider } from './LighterProvider.js'

// ---------------------------------------------------------------------------
// Recorded venue snapshot: Lighter `GET /api/v1/account?by=l1_address` for
// address `0xDbab51f11B3c5CE383776e6AE6B121E527aCD9Af` (account index 7684),
// recorded 2026-09-22T15:20:58Z. Every value below is copied verbatim from
// that response's non-zero position and asset rows — the zero-size position
// rows are omitted, since `mapOpenPositions` drops them before the SDK ever
// sees them and keeping them would only add noise.
// ---------------------------------------------------------------------------

const ADDRESS = '0xDbab51f11B3c5CE383776e6AE6B121E527aCD9Af' as const

const POSITIONS = [
  {
    market_id: 1,
    symbol: 'BTC',
    initial_margin_fraction: '2.00',
    open_order_count: 14,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: 1,
    position: '0.28253',
    avg_entry_price: '86150.9',
    position_value: '24330.522998',
    unrealized_pnl: '-9.701078',
    realized_pnl: '0.000000',
    liquidation_price: '0',
    total_funding_paid_out: '-0.450766',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 4,
    symbol: '1000PEPE',
    initial_margin_fraction: '10.00',
    open_order_count: 6,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '1384631',
    avg_entry_price: '0.004995',
    position_value: '6805.461365',
    unrealized_pnl: '111.292719',
    realized_pnl: '0.000000',
    liquidation_price: '0.26218876697561394',
    total_funding_paid_out: '15.540546',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 5,
    symbol: 'WIF',
    initial_margin_fraction: '10.00',
    open_order_count: 7,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: 1,
    position: '2117.5',
    avg_entry_price: '0.25667',
    position_value: '548.241925',
    unrealized_pnl: '4.742661',
    realized_pnl: '0.000000',
    liquidation_price: '0',
    total_funding_paid_out: '-0.029247',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 8,
    symbol: 'LINK',
    initial_margin_fraction: '10.00',
    open_order_count: 10,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '2485.4',
    avg_entry_price: '13.01378',
    position_value: '32318.948608',
    unrealized_pnl: '25.501914',
    realized_pnl: '0.000000',
    liquidation_price: '156.33225309777552',
    total_funding_paid_out: '0.000000',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 14,
    symbol: 'POL',
    initial_margin_fraction: '12.50',
    open_order_count: 8,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '40900',
    avg_entry_price: '0.108609',
    position_value: '4396.872700',
    unrealized_pnl: '45.243323',
    realized_pnl: '0.000000',
    liquidation_price: '8.695732652258691',
    total_funding_paid_out: '37.859040',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 15,
    symbol: 'TRUMP',
    initial_margin_fraction: '10.00',
    open_order_count: 10,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: 1,
    position: '231.93',
    avg_entry_price: '2.1446',
    position_value: '506.836629',
    unrealized_pnl: '9.448843',
    realized_pnl: '0.000000',
    liquidation_price: '0',
    total_funding_paid_out: '-0.006216',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 19,
    symbol: '1000FLOKI',
    initial_margin_fraction: '20.00',
    open_order_count: 8,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '304171',
    avg_entry_price: '0.029248',
    position_value: '9016.540953',
    unrealized_pnl: '-120.035668',
    realized_pnl: '0.000000',
    liquidation_price: '1.138050850576074',
    total_funding_paid_out: '7.217602',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 21,
    symbol: 'FARTCOIN',
    initial_margin_fraction: '10.00',
    open_order_count: 8,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '39141.8',
    avg_entry_price: '0.20012',
    position_value: '7848.713736',
    unrealized_pnl: '-15.708385',
    realized_pnl: '0.000000',
    liquidation_price: '9.30151262786104',
    total_funding_paid_out: '25.100221',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 25,
    symbol: 'BNB',
    initial_margin_fraction: '5.00',
    open_order_count: 10,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: 1,
    position: '54.06',
    avg_entry_price: '786.6380',
    position_value: '42612.584166',
    unrealized_pnl: '86.936496',
    realized_pnl: '0.000000',
    liquidation_price: '0',
    total_funding_paid_out: '-3.164961',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 34,
    symbol: 'DATA',
    initial_margin_fraction: '10.00',
    open_order_count: 0,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '0.01',
    avg_entry_price: '0.3053',
    position_value: '0.002155',
    unrealized_pnl: '0.000898',
    realized_pnl: '0.000000',
    liquidation_price: '35622923.53962113',
    total_funding_paid_out: '-1761.747996',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 39,
    symbol: 'ADA',
    initial_margin_fraction: '10.00',
    open_order_count: 10,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '177173.7',
    avg_entry_price: '0.24856',
    position_value: '44638.913715',
    unrealized_pnl: '-600.531769',
    realized_pnl: '0.000000',
    liquidation_price: '2.2625714028448423',
    total_funding_paid_out: '16.107369',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 46,
    symbol: 'LDO',
    initial_margin_fraction: '10.00',
    open_order_count: 7,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '50188.9',
    avg_entry_price: '0.42434',
    position_value: '20580.962223',
    unrealized_pnl: '716.140489',
    realized_pnl: '0.000000',
    liquidation_price: '7.507839292437398',
    total_funding_paid_out: '123.969696',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 66,
    symbol: 'USELESS',
    initial_margin_fraction: '33.33',
    open_order_count: 8,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: 1,
    position: '18786.0',
    avg_entry_price: '0.30005',
    position_value: '5762.041920',
    unrealized_pnl: '125.366720',
    realized_pnl: '0.000000',
    liquidation_price: '0',
    total_funding_paid_out: '-0.081436',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 89,
    symbol: 'EDEN',
    initial_margin_fraction: '33.33',
    open_order_count: 8,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '9316.2',
    avg_entry_price: '0.05908',
    position_value: '571.548870',
    unrealized_pnl: '-21.187786',
    realized_pnl: '0.000000',
    liquidation_price: '33.83790653911859',
    total_funding_paid_out: '0.189904',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 90,
    symbol: 'ZEC',
    initial_margin_fraction: '5.00',
    open_order_count: 10,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '4.814',
    avg_entry_price: '1518.516',
    position_value: '7472.353382',
    unrealized_pnl: '-162.219572',
    realized_pnl: '0.000000',
    liquidation_price: '77706.10622318077',
    total_funding_paid_out: '67.179982',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 91,
    symbol: 'MON',
    initial_margin_fraction: '10.00',
    open_order_count: 14,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '180066.7',
    avg_entry_price: '0.02578',
    position_value: '4796.976888',
    unrealized_pnl: '-154.002268',
    realized_pnl: '0.000000',
    liquidation_price: '2.004958218977808',
    total_funding_paid_out: '0.610005',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 171,
    symbol: 'BIO',
    initial_margin_fraction: '33.33',
    open_order_count: 10,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: -1,
    position: '133699',
    avg_entry_price: '0.029014',
    position_value: '3881.683067',
    unrealized_pnl: '-2.480754',
    realized_pnl: '0.000000',
    liquidation_price: '2.3825970208957186',
    total_funding_paid_out: '0.822972',
    margin_mode: 0,
    margin_set_flag: 1,
    allocated_margin: '0.000000',
  },
  {
    market_id: 194,
    symbol: 'SPCX',
    initial_margin_fraction: '5.00',
    open_order_count: 12,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign: 1,
    position: '21.3268',
    avg_entry_price: '151.36',
    position_value: '3281.554716',
    unrealized_pnl: '53.590208',
    realized_pnl: '0.000000',
    liquidation_price: '147.10989686467767',
    total_funding_paid_out: '-3.841771',
    margin_mode: 1,
    margin_set_flag: 1,
    allocated_margin: '184.702660',
  },
]

const ASSETS = [
  {
    symbol: 'USDC',
    asset_id: 3,
    balance: '103.00085138124',
    locked_balance: '0.000000',
    margin_mode: 'disabled' as const,
    margin_balance: '389896.203432754517',
    multiplier: '1.000000000000000000',
  },
]

const ACCOUNT_PAYLOAD = {
  code: 200,
  total: 9,
  accounts: [
    {
      code: 0,
      account_type: 0,
      index: 7684,
      l1_address: ADDRESS,
      cancel_all_time: 1790090747204,
      total_order_count: 160,
      total_isolated_order_count: 0,
      pending_order_count: 0,
      available_balance: '369456.194227',
      status: 1,
      collateral: '389896.203432',
      transaction_time: 1790090458369971,
      account_trading_mode: 0,
      account_index: 7684,
      name: '',
      description: '',
      positions: POSITIONS,
      assets: ASSETS,
      total_asset_value: '390173.303079',
      cross_asset_value: '389935.010211',
      cross_initial_margin_requirement: '20553.031116',
    },
  ],
}

/** Named constants recorded alongside the snapshot, for later issues. */
const AVAILABLE_BALANCE = ACCOUNT_PAYLOAD.accounts[0].available_balance
const TOTAL_ASSET_VALUE = ACCOUNT_PAYLOAD.accounts[0].total_asset_value
const CROSS_ASSET_VALUE = ACCOUNT_PAYLOAD.accounts[0].cross_asset_value
const CROSS_INITIAL_MARGIN_REQUIREMENT =
  ACCOUNT_PAYLOAD.accounts[0].cross_initial_margin_requirement
const COLLATERAL = ACCOUNT_PAYLOAD.accounts[0].collateral

const marketFixture = (marketId: number, symbol: string) => ({
  providerId: 'lighter',
  id: String(marketId),
  categoryId: 'lighter',
  baseAsset: {
    providerId: 'lighter',
    id: String(marketId),
    displaySymbol: symbol,
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'lighter',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
  szDecimals: 4,
  markPrice: '1',
  maxLeverage: 50,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  funding: { rate: '0', nextFundingTime: 0 },
})

const MARKETS_RESPONSE = {
  markets: POSITIONS.map((p) => marketFixture(p.market_id, p.symbol)),
}

const PROVIDERS_RESPONSE = {
  providers: [
    {
      key: 'lighter',
      categories: [
        {
          id: 'lighter',
          quoteAsset: {
            providerId: 'lighter',
            id: 'USDC',
            displaySymbol: 'USDC',
            logoURI: '',
          },
        },
        { id: 'spot', quoteAsset: null },
      ],
    },
  ],
}

const ASSETS_RESPONSE = {
  assets: [
    {
      providerId: 'lighter',
      id: '3',
      displaySymbol: 'USDC',
      logoURI: '',
    },
  ],
}

const STUB_CLIENT = {
  config: { apiUrl: 'https://backend.test/v1/perps' },
} as PerpsSDKClient

const respond = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('accountSummary.venue', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('backend.test/v1/perps/markets')) {
          return respond(MARKETS_RESPONSE)
        }
        if (u.includes('backend.test/v1/perps/assets')) {
          return respond(ASSETS_RESPONSE)
        }
        if (u.includes('backend.test/v1/perps/providers')) {
          return respond(PROVIDERS_RESPONSE)
        }
        if (u.includes('/api/v1/account?')) {
          return respond(ACCOUNT_PAYLOAD)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const load = async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })
    const { positions } = await provider.getPositions({ address: ADDRESS })
    return {
      account,
      positions,
      summary: getAccountSummary(account, positions),
    }
  }

  it('AccountSummary.availableMargin equals available_balance', async () => {
    const { summary } = await load()
    expect(summary.availableMargin).toBe(AVAILABLE_BALANCE)
  })

  it('AccountSummary.portfolioValue equals total_asset_value plus the value of non-settlement spot assets', async () => {
    const { summary } = await load()
    // The recorded account holds only settlement (USDC) spot dust, so the
    // non-settlement contribution is `0`.
    expect(summary.portfolioValue).toBe(TOTAL_ASSET_VALUE)
  })

  it('records available_balance, total_asset_value, cross_asset_value, cross_initial_margin_requirement, and collateral as named constants', () => {
    expect(AVAILABLE_BALANCE).toBe('369456.194227')
    expect(TOTAL_ASSET_VALUE).toBe('390173.303079')
    expect(CROSS_ASSET_VALUE).toBe('389935.010211')
    expect(CROSS_INITIAL_MARGIN_REQUIREMENT).toBe('20553.031116')
    expect(COLLATERAL).toBe('389896.203432')
  })
})
