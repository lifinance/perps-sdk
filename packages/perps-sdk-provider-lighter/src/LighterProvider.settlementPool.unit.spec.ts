import { createPerpsClient } from '@lifi/perps-sdk'
import type { AccountResponse, WasmBlobActionStep } from '@lifi/perps-types'
import {
  ActionType,
  PerpsErrorCode,
  PositionMarginAdjustment,
  SigningMethod,
} from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAccountSummary } from './accountSummary.js'
import { lighterProvider } from './LighterProvider.js'

const ADDRESS = '0x83f21B84c0f00DB8553a1DB7d15eBA05B3E049dF' as const

const asset = (
  asset_id: number,
  symbol: string,
  balance: string,
  margin_balance: string,
  margin_mode = 'enabled'
) => ({
  symbol,
  asset_id,
  balance,
  locked_balance: '0',
  margin_mode,
  margin_balance,
  multiplier: '1',
})

const BTC_POSITION = {
  market_id: 1,
  symbol: 'BTC',
  initial_margin_fraction: '2.22',
  open_order_count: 2,
  pending_order_count: 2,
  position_tied_order_count: 2,
  sign: 1,
  position: '0.00023',
  avg_entry_price: '86362.4',
  position_value: '19.456781',
  unrealized_pnl: '-0.397877',
  realized_pnl: '0.000000',
  liquidation_price: '0',
  total_funding_paid_out: '-0.002490',
  margin_mode: 0,
  margin_set_flag: 1,
  allocated_margin: '0.000000',
}

type LiveAccount = {
  index: number
  account_trading_mode: number
  available_balance: string
  collateral: string
  total_asset_value: string
  cross_asset_value: string
  cross_initial_margin_requirement: string
  positions: unknown[]
  assets: ReturnType<typeof asset>[]
}

// Public REST figures of mainnet accounts 12, 37 and 42, recorded 2026-10-03.
const ACCOUNT_12: LiveAccount = {
  index: 12,
  account_trading_mode: 1,
  available_balance: '8.895126',
  collateral: '8.895126',
  total_asset_value: '8.895126',
  cross_asset_value: '8.895126',
  cross_initial_margin_requirement: '0',
  positions: [],
  assets: [
    asset(1, 'ETH', '0', '0.00709091'),
    asset(2, 'LIT', '8.00004674', '0', 'disabled'),
    asset(3, 'USDC', '0.000000', '8.89512645205'),
  ],
}

const ACCOUNT_37: LiveAccount = {
  index: 37,
  account_trading_mode: 1,
  available_balance: '186.891946',
  collateral: '187.721957',
  total_asset_value: '187.32408',
  cross_asset_value: '187.32408',
  cross_initial_margin_requirement: '0.432134',
  positions: [BTC_POSITION],
  assets: [
    asset(1, 'ETH', '0.000111238', '0'),
    asset(2, 'LIT', '10.00041467', '0', 'disabled'),
    asset(3, 'USDC', '0.000000', '187.721957147883'),
    asset(11, 'XAUT', '0.00009804', '0', 'disabled'),
  ],
}

const ACCOUNT_42: LiveAccount = {
  index: 42,
  account_trading_mode: 0,
  available_balance: '0.001003',
  collateral: '0.001003',
  total_asset_value: '0.001003',
  cross_asset_value: '0.001003',
  cross_initial_margin_requirement: '0',
  positions: [],
  assets: [
    asset(2, 'LIT', '8300.37352999', '0', 'disabled'),
    asset(3, 'USDC', '60524.61222039', '0.001003514738', 'disabled'),
  ],
}

const respond = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })

const descriptor = (id: string, displaySymbol: string) => ({
  providerId: 'lighter',
  id,
  displaySymbol,
  logoURI: '',
})
const USDC = descriptor('USDC', 'USDC')
const SPOT_MARKETS = [
  { id: '2048', baseAsset: descriptor('1', 'ETH') },
  { id: '2049', baseAsset: descriptor('2', 'LIT') },
  { id: '2050', baseAsset: descriptor('11', 'XAUT') },
].map((market) => ({
  ...market,
  providerId: 'lighter',
  categoryId: 'spot',
  quoteAsset: USDC,
}))
const BTC_PERP = {
  id: '1',
  providerId: 'lighter',
  categoryId: 'perps',
  baseAsset: descriptor('BTC', 'BTC'),
  quoteAsset: USDC,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

let accountRequests = 0

function setup(live: LiveAccount) {
  accountRequests = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/marketsContext')) {
        return respond({
          prices: [
            { marketId: '1', midPrice: '84600', markPrice: '84600' },
            { marketId: '2048', midPrice: '2000', markPrice: '2000' },
            { marketId: '2049', midPrice: '1', markPrice: '1' },
            { marketId: '2050', midPrice: '4000', markPrice: '4000' },
          ],
        })
      }
      if (url.includes('/markets')) {
        return respond({ markets: [BTC_PERP, ...SPOT_MARKETS] })
      }
      if (url.includes('/assets')) {
        return respond({
          assets: live.assets.map((a) =>
            descriptor(String(a.asset_id), a.symbol)
          ),
        })
      }
      if (url.includes('/providers')) {
        return respond({
          providers: [
            {
              key: 'lighter',
              categories: [
                { id: 'perps', quoteAsset: USDC },
                { id: 'spot', quoteAsset: null },
              ],
            },
          ],
        })
      }
      if (url.includes('/api/v1/account?')) {
        accountRequests += 1
        return respond({
          code: 200,
          total: 1,
          accounts: [
            {
              code: 0,
              account_type: 0,
              l1_address: ADDRESS,
              cancel_all_time: 0,
              total_order_count: 0,
              total_isolated_order_count: 0,
              pending_order_count: 0,
              status: 1,
              transaction_time: 0,
              account_index: live.index,
              name: '',
              description: '',
              ...live,
            },
          ],
        })
      }
      if (url.includes('/api/v1/apikeys')) {
        return respond({ code: 0, api_keys: [] })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
  )
  const provider = lighterProvider()
  createPerpsClient({
    integrator: 'test',
    apiKey: 'test',
    apiUrl: 'https://backend.test/v1/perps',
    providers: [provider],
  })
  return provider
}

const rows = (
  account: AccountResponse,
  kind: 'balances' | 'collateralBalances'
) =>
  account[kind].map((b) => ({
    categoryId: b.categoryId,
    assetId: b.asset.id,
    units: b.units,
    transferable: b.transferable,
  }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Lighter unified settlement pool — getAccount', () => {
  it('reports account 12 USDC as one spot row with the margin route spendable', async () => {
    const account = await setup(ACCOUNT_12).getAccount({ address: ADDRESS })

    expect(rows(account, 'balances')).toEqual([
      {
        categoryId: 'spot',
        assetId: '2',
        units: '8.00004674',
        transferable: '8.00004674',
      },
      {
        categoryId: 'spot',
        assetId: '3',
        units: '8.89512645205',
        transferable: '8.895126',
      },
    ])
    expect(
      account.collateralBalances.map((b) => b.asset.displaySymbol)
    ).toEqual(['ETH'])
  })

  it('caps account 37 USDC transferable at available_balance while a position holds margin', async () => {
    const account = await setup(ACCOUNT_37).getAccount({ address: ADDRESS })

    expect(account.positions).toHaveLength(1)
    expect(
      rows(account, 'balances').find((row) => row.assetId === '3')
    ).toEqual({
      categoryId: 'spot',
      assetId: '3',
      units: '187.721957147883',
      transferable: '186.891946',
    })
    expect(account.collateralBalances).toEqual([])
  })

  it('keeps both USDC routes of Simple account 42 as separate rows', async () => {
    const account = await setup(ACCOUNT_42).getAccount({ address: ADDRESS })

    expect(rows(account, 'balances')).toEqual([
      {
        categoryId: 'spot',
        assetId: '2',
        units: '8300.37352999',
        transferable: '8300.37352999',
      },
      {
        categoryId: 'spot',
        assetId: '3',
        units: '60524.61222039',
        transferable: '60524.61222039',
      },
    ])
    expect(rows(account, 'collateralBalances')).toEqual([
      {
        categoryId: 'perps',
        assetId: 'USDC',
        units: '0.001003514738',
        transferable: '0.001003',
      },
    ])
  })

  it('floors the pooled transferable at 0 when the spot route is over-locked', async () => {
    const overLocked: LiveAccount = {
      ...ACCOUNT_12,
      available_balance: '0',
      assets: [{ ...asset(3, 'USDC', '1', '5'), locked_balance: '3' }],
    }
    const account = await setup(overLocked).getAccount({ address: ADDRESS })

    expect(rows(account, 'balances')).toEqual([
      { categoryId: 'spot', assetId: '3', units: '6', transferable: '0' },
    ])
  })

  it.each([
    // total_asset_value + ETH margin 0.00709091 × 2000 + LIT 8.00004674.
    ['12', ACCOUNT_12, '31.07699274', '8.895126'],
    // total_asset_value + ETH 0.000111238 × 2000 + LIT + XAUT 0.00009804 × 4000.
    ['37', ACCOUNT_37, '197.93913067', '186.891946'],
    // total_asset_value + USDC spot 60524.61222039 + LIT 8300.37352999.
    ['42', ACCOUNT_42, '68824.98675338', '0.001003'],
  ])('keeps the account %s summary figures', async (_index, live, portfolioValue, availableMargin) => {
    const account = await setup(live).getAccount({ address: ADDRESS })
    const summary = getAccountSummary(account, account.positions)

    expect(summary.portfolioValue).toBe(portfolioValue)
    expect(summary.availableMargin).toBe(availableMargin)
  })
})

describe('Lighter unified settlement pool — SEND_ASSET', () => {
  const sendAsset: WasmBlobActionStep = {
    action: ActionType.SEND_ASSET,
    wasmSignParams: { sourceDex: 'perps', destinationDex: 'spot', amount: 1 },
  }

  it('refuses a same-account transfer for a unified account before it signs', async () => {
    const provider = setup(ACCOUNT_12)

    await expect(
      provider.signActions?.(SigningMethod.WASM_BLOB, [sendAsset], ADDRESS)
    ).rejects.toMatchObject({ code: PerpsErrorCode.PooledCategoryTransfer })
    expect(accountRequests).toBe(1)
  })

  // With no registered API key, the signer itself refuses the batch.
  it('passes a Simple account on to the signer', async () => {
    const provider = setup(ACCOUNT_42)

    await expect(
      provider.signActions?.(SigningMethod.WASM_BLOB, [sendAsset], ADDRESS)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })

  it('propagates an account read error instead of signing', async () => {
    const provider = setup(ACCOUNT_12)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond({ code: 200, total: 0, accounts: [] }))
    )

    await expect(
      provider.signActions?.(SigningMethod.WASM_BLOB, [sendAsset], ADDRESS)
    ).rejects.toMatchObject({ code: PerpsErrorCode.AccountNotFound })
  })
})
