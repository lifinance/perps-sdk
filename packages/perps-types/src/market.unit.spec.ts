import { describe, expect, it } from 'vitest'
import type { Asset } from './asset.js'
import { PositionMarginAdjustment } from './enums.js'
import type {
  BaseMarket,
  MarketContext,
  MarketDisplay,
  OhlcvInterval,
  OhlcvResponse,
  PerpsMarket,
  PerpsMarketDisplay,
  SpotMarket,
} from './market.js'

const btc: Asset = {
  providerId: 'hyperliquid',
  id: 'BTC',
  displaySymbol: 'BTC',
  logoURI: 'https://example.com/btc.png',
}

const usdc: Asset = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://example.com/usdc.png',
}

const perpsMarket: PerpsMarket = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: btc,
  quoteAsset: usdc,
  szDecimals: 5,
  priceDecimals: 1,
  maxLeverage: 50,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  maintenanceMarginRate: 0.01,
}

const spotMarket: SpotMarket = {
  providerId: 'hyperliquid',
  id: '@142',
  categoryId: 'spot',
  baseAsset: { ...btc, id: 'PURR', displaySymbol: 'PURR' },
  quoteAsset: usdc,
  szDecimals: 2,
}

describe('PerpsMarket', () => {
  it('composes base + quote Assets and carries perps-only fields', () => {
    expect(perpsMarket.baseAsset.displaySymbol).toBe('BTC')
    expect(perpsMarket.quoteAsset.displaySymbol).toBe('USDC')
    expect(perpsMarket.maxLeverage).toBe(50)
    expect(perpsMarket.onlyIsolated).toBe(false)
    expect(perpsMarket.positionMarginAdjustment).toBe(
      PositionMarginAdjustment.ADD_AND_REMOVE
    )
  })

  it('optionally carries venue tick and margin metadata', () => {
    expect(perpsMarket.priceDecimals).toBe(1)
    expect(perpsMarket.maintenanceMarginRate).toBe(0.01)
  })
})

describe('SpotMarket', () => {
  it('carries a non-null quote leg and no perps fields', () => {
    expect(spotMarket.quoteAsset.displaySymbol).toBe('USDC')
    expect('maxLeverage' in spotMarket).toBe(false)
    expect('funding' in spotMarket).toBe(false)
    expect('positionMarginAdjustment' in spotMarket).toBe(false)
  })
})

describe('MarketDisplay', () => {
  it('is the shared subset embedded on Position/Fill/Order', () => {
    const display: MarketDisplay = {
      providerId: perpsMarket.providerId,
      id: perpsMarket.id,
      categoryId: perpsMarket.categoryId,
      baseAsset: perpsMarket.baseAsset,
      quoteAsset: perpsMarket.quoteAsset,
    }
    expect(display.id).toBe('BTC')
    expect(display.baseAsset.id).toBe('BTC')
  })
})

describe('PerpsMarketDisplay', () => {
  it('carries the position-level margin adjustment capability', () => {
    const display: PerpsMarketDisplay = {
      providerId: perpsMarket.providerId,
      id: perpsMarket.id,
      categoryId: perpsMarket.categoryId,
      baseAsset: perpsMarket.baseAsset,
      quoteAsset: perpsMarket.quoteAsset,
      positionMarginAdjustment: perpsMarket.positionMarginAdjustment,
    }

    expect(display.positionMarginAdjustment).toBe(
      PositionMarginAdjustment.ADD_AND_REMOVE
    )
  })
})

describe('MarketContext', () => {
  it('carries mid/mark/oracle plus the live stats fields for a perp market', () => {
    const ctx: MarketContext = {
      marketId: 'BTC',
      midPrice: '60000',
      markPrice: '60010',
      oraclePrice: '59995',
      prevDayPrice: '59000',
      priceChange24h: '1.71',
      volume24h: '123456',
      marketCap: '1200000000000',
      openInterest: '1000',
      funding: { rate: '0.0001', nextFundingTime: 1_700_000_000_000 },
    }
    expect(ctx.marketId).toBe('BTC')
    expect(ctx.midPrice).toBe('60000')
    expect(ctx.markPrice).toBe('60010')
    expect(ctx.oraclePrice).toBe('59995')
    expect(ctx.priceChange24h).toBe('1.71')
    expect(ctx.marketCap).toBe('1200000000000')
    expect(ctx.funding?.rate).toBe('0.0001')
  })

  it('omits oracle and the perp-only fields for a spot market', () => {
    const ctx: MarketContext = {
      marketId: '@142',
      midPrice: '0.5',
      markPrice: '0.5',
    }
    expect(ctx.oraclePrice).toBeUndefined()
    expect(ctx.openInterest).toBeUndefined()
    expect(ctx.funding).toBeUndefined()
  })
})

describe('BaseMarket', () => {
  it('survives a JSON roundtrip', () => {
    const base: BaseMarket = perpsMarket
    const parsed = JSON.parse(JSON.stringify(base)) as BaseMarket
    expect(parsed).toEqual(perpsMarket)
  })
})

describe('OhlcvResponse', () => {
  it('echoes the requested interval alongside the candles', () => {
    const response: OhlcvResponse = {
      provider: 'hyperliquid',
      marketId: 'BTC',
      interval: '1h',
      candles: [
        {
          t: 1_700_000_000_000,
          o: '60000',
          h: '60500',
          l: '59800',
          c: '60250',
          v: '12.5',
        },
      ],
    }
    expect(response.interval).toBe('1h')
    expect(response.candles).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Compile-time assertions
// ---------------------------------------------------------------------------

type Expect<T extends true> = T
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

// `interval` is the union, not a bare `string`: the route can only ever echo a
// member back, so consumers switch on it exhaustively.
type _OhlcvResponseIntervalShape = Expect<
  Equals<OhlcvResponse['interval'], OhlcvInterval>
>

export type _TypeAssertions = [_OhlcvResponseIntervalShape]
