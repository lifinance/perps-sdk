import {
  type Market,
  type MarketContext,
  PositionMarginAdjustment,
} from '@lifi/perps-types'
import type {
  HlAbstractionMode,
  HlActiveAssetData,
} from '../src/types/index.js'
import { USDC_ASSET } from './fixtures.js'

// ---------------------------------------------------------------------------
// Recorded venue snapshots for the venue-oracle account summary specs. Every
// numeric field below is copied from a live Hyperliquid `/info` response, not
// derived. `HlClearinghouseState`/`HlSpotClearinghouseState` in
// `src/types/account.ts` omit some fields the venue returns; the types here
// carry the full recorded wire shape instead of extending those SDK types,
// since a wider field (e.g. `liquidationPx: string | null`) cannot narrow an
// SDK type through `extends`.
// ---------------------------------------------------------------------------

export interface RecordedMarginSummary {
  accountValue: string
  totalNtlPos: string
  totalRawUsd: string
  totalMarginUsed: string
}

export interface RecordedPosition {
  coin: string
  szi: string
  entryPx: string
  positionValue: string
  liquidationPx: string | null
  unrealizedPnl: string
  returnOnEquity?: string
  marginUsed: string
  maxLeverage?: number
  leverage: { type: string; value: number; rawUsd?: string }
  cumFunding: { allTime: string; sinceOpen: string; sinceChange: string }
}

export interface RecordedAssetPosition {
  type: string
  position: RecordedPosition
}

export interface RecordedClearinghouseState {
  marginSummary: RecordedMarginSummary
  crossMarginSummary: RecordedMarginSummary
  crossMaintenanceMarginUsed: string
  withdrawable: string
  assetPositions: RecordedAssetPosition[]
  time: number
}

export interface RecordedSpotBalance {
  coin: string
  token: number
  total: string
  hold: string
  entryNtl: string
  ltv?: string
  supplied?: string
}

export interface RecordedSpotClearinghouseState {
  balances: RecordedSpotBalance[]
  tokenToAvailableAfterMaintenance: [number, string][]
  portfolioMarginEnabled?: boolean
  portfolioMarginRatio?: string
  tokenToPortfolioBorrowRatio?: [number, string][]
  tokenToPortfolioSupplyRatio?: [number, string][]
}

export interface RecordedOpenOrder {
  coin: string
  side: string
  limitPx: string
  sz: string
  oid: number
  timestamp: number
  origSz: string
  reduceOnly?: boolean
}

export interface RecordedSnapshot {
  address: string
  recordedAt: string
  userAbstraction: HlAbstractionMode | null
  clearinghouseState: RecordedClearinghouseState
  spotClearinghouseState: RecordedSpotClearinghouseState
  openOrders: RecordedOpenOrder[] | null
  activeAssetData: Record<string, HlActiveAssetData>
}

// ---------------------------------------------------------------------------
// Unified-account snapshot. Address `0x235987B53ED16a5F331c3648F78cBc148A877D27`,
// recorded 2026-09-22T12:45:37Z over 5.3 s. Copied verbatim from the recorded
// `/info` payload in ORD-1767.
// ---------------------------------------------------------------------------

export const UNIFIED_SNAPSHOT: RecordedSnapshot = {
  address: '0x235987B53ED16a5F331c3648F78cBc148A877D27',
  recordedAt: '2026-09-22T12:45:37Z',
  userAbstraction: 'unifiedAccount',
  clearinghouseState: {
    marginSummary: {
      accountValue: '2193.808086',
      totalNtlPos: '3428.625',
      totalRawUsd: '-1234.816914',
      totalMarginUsed: '2123.360586',
    },
    crossMarginSummary: {
      accountValue: '70.4475',
      totalNtlPos: '0.0',
      totalRawUsd: '70.4475',
      totalMarginUsed: '0.0',
    },
    crossMaintenanceMarginUsed: '0.0',
    withdrawable: '0.6975',
    assetPositions: [
      {
        type: 'oneWay',
        position: {
          coin: 'MEGA',
          szi: '75000.0',
          leverage: { type: 'isolated', value: 3, rawUsd: '-1305.264414' },
          entryPx: '0.063913',
          positionValue: '3428.625',
          unrealizedPnl: '-1364.860533',
          returnOnEquity: '-0.8541971329',
          liquidationPx: '0.0208842306',
          marginUsed: '2123.360586',
          maxLeverage: 3,
          cumFunding: {
            allTime: '76.978512',
            sinceOpen: '77.629137',
            sinceChange: '26.092132',
          },
        },
      },
    ],
    time: 1790081138245,
  },
  spotClearinghouseState: {
    balances: [
      {
        coin: 'USDC',
        token: 0,
        total: '2296.35783828',
        hold: '2193.808086',
        entryNtl: '0.0',
      },
      {
        coin: 'BRIDGE',
        token: 73,
        total: '6.15',
        hold: '0.0',
        entryNtl: '0.87453',
      },
      {
        coin: 'HYPE',
        token: 150,
        total: '2.10613124',
        hold: '0.0',
        entryNtl: '149.93086503',
      },
      {
        coin: 'BASED',
        token: 339,
        total: '40.230704',
        hold: '0.0',
        entryNtl: '4.14456712',
      },
      {
        coin: 'MAX',
        token: 734,
        total: '68598.161692',
        hold: '0.0',
        entryNtl: '0.0',
      },
    ],
    tokenToAvailableAfterMaintenance: [[0, '172.99725228']],
  },
  openOrders: [
    {
      coin: 'MEGA',
      side: 'B',
      limitPx: '0.04185',
      sz: '5000.0',
      oid: 551012943170,
      timestamp: 1789939841290,
      origSz: '5000.0',
    },
  ],
  activeAssetData: {
    MEGA: {
      user: '0x235987b53ed16a5f331c3648f78cbc148a877d27',
      coin: 'MEGA',
      leverage: { type: 'isolated', value: 3 },
      maxTradeSzs: ['6775.0', '225696.0'],
      availableToTrade: ['103.239708', '3439.23088'],
      markPx: '0.045715',
    },
  },
}

/** Spot mids recorded alongside {@link UNIFIED_SNAPSHOT}, as `MarketContext` rows. */
export const UNIFIED_PRICES: MarketContext[] = [
  { marketId: '@219', midPrice: '0.032788', markPrice: '0.032788' },
  { marketId: '@107', midPrice: '95.6955', markPrice: '95.6955' },
  { marketId: '@305', midPrice: '0.06657', markPrice: '0.06657' },
  { marketId: '@591', midPrice: '0.0000002', markPrice: '0.0000002' },
]

export const UNIFIED_WITHDRAWABLE =
  UNIFIED_SNAPSHOT.clearinghouseState.withdrawable
export const UNIFIED_AVAILABLE_TO_TRADE_MEGA =
  UNIFIED_SNAPSHOT.activeAssetData.MEGA.availableToTrade

// ---------------------------------------------------------------------------
// Standard-mode snapshot. Address `0x68e6c818f76f09fdc63c33f17fbbd734f826b73c`,
// recorded 2026-09-22T15:43:38Z, `userAbstraction` null. One isolated HYPE
// short and two zero-size reduce-only resting orders on HYPE.
// ---------------------------------------------------------------------------

export const STANDARD_SNAPSHOT: RecordedSnapshot = {
  address: '0x68e6c818f76f09fdc63c33f17fbbd734f826b73c',
  recordedAt: '2026-09-22T15:43:38Z',
  userAbstraction: null,
  clearinghouseState: {
    marginSummary: {
      accountValue: '106.720442',
      totalNtlPos: '1425.945',
      totalRawUsd: '1532.665442',
      totalMarginUsed: '106.720442',
    },
    crossMarginSummary: {
      accountValue: '0.0',
      totalNtlPos: '0.0',
      totalRawUsd: '0.0',
      totalMarginUsed: '0.0',
    },
    crossMaintenanceMarginUsed: '0.0',
    withdrawable: '0.0',
    assetPositions: [
      {
        type: 'oneWay',
        position: {
          coin: 'HYPE',
          szi: '-15.0',
          leverage: { type: 'isolated', value: 10, rawUsd: '1532.665442' },
          entryPx: '92.8886',
          positionValue: '1425.945',
          unrealizedPnl: '-32.616',
          returnOnEquity: '-0.2340868524',
          liquidationPx: '97.3120915556',
          marginUsed: '106.720442',
          maxLeverage: 10,
          cumFunding: {
            allTime: '-0.197801',
            sinceOpen: '-0.552263',
            sinceChange: '-0.511878',
          },
        },
      },
    ],
    time: 1790091817127,
  },
  spotClearinghouseState: {
    balances: [
      {
        coin: 'USDC',
        token: 0,
        total: '289.1707113',
        hold: '106.808942',
        entryNtl: '0.0',
      },
      {
        coin: 'BRIDGE',
        token: 73,
        total: '132.19',
        hold: '0.0',
        entryNtl: '17.5587977',
      },
      {
        coin: 'HYPE',
        token: 150,
        total: '0.01207272',
        hold: '0.0',
        entryNtl: '1.12119727',
      },
      {
        coin: 'MAX',
        token: 734,
        total: '426184.737027',
        hold: '0.0',
        entryNtl: '0.0',
      },
    ],
    tokenToAvailableAfterMaintenance: [[0, '182.3617693']],
  },
  openOrders: [
    {
      coin: 'HYPE',
      side: 'B',
      limitPx: '106.78',
      sz: '0.0',
      oid: 552112661366,
      timestamp: 1790016481011,
      origSz: '0.0',
      reduceOnly: true,
    },
    {
      coin: 'HYPE',
      side: 'B',
      limitPx: '52.8',
      sz: '0.0',
      oid: 552110349029,
      timestamp: 1790016288646,
      origSz: '0.0',
      reduceOnly: true,
    },
  ],
  activeAssetData: {
    HYPE: {
      user: '0x68e6c818f76f09fdc63c33f17fbbd734f826b73c',
      coin: 'HYPE',
      leverage: { type: 'isolated', value: 10 },
      maxTradeSzs: ['45.42', '19.18'],
      availableToTrade: ['431.749348', '182.319517'],
      markPx: '95.0571',
    },
  },
}

/** Spot mids recorded alongside {@link STANDARD_SNAPSHOT}, as `MarketContext` rows. */
export const STANDARD_PRICES: MarketContext[] = [
  { marketId: '@219', midPrice: '0.03372', markPrice: '0.03372' },
  { marketId: '@107', midPrice: '95.037', markPrice: '95.037' },
  { marketId: '@591', midPrice: '0.0000002', markPrice: '0.0000002' },
]

export const STANDARD_WITHDRAWABLE =
  STANDARD_SNAPSHOT.clearinghouseState.withdrawable
export const STANDARD_AVAILABLE_TO_TRADE_HYPE =
  STANDARD_SNAPSHOT.activeAssetData.HYPE.availableToTrade

// ---------------------------------------------------------------------------
// Portfolio-margin snapshot. Address `0xbf732ea04197942783e34730ed6e0f6099575d58`,
// recorded 2026-09-22T15:31:45Z, `userAbstraction` portfolioMargin. Four open
// cross positions (ETH, NEAR, PENGU, XPL), no resting orders.
// ---------------------------------------------------------------------------

export const PM_SNAPSHOT: RecordedSnapshot = {
  address: '0xbf732ea04197942783e34730ed6e0f6099575d58',
  recordedAt: '2026-09-22T15:31:45Z',
  userAbstraction: 'portfolioMargin',
  clearinghouseState: {
    marginSummary: {
      accountValue: '4101762.727651',
      totalNtlPos: '40531830.6688859984',
      totalRawUsd: '-36430067.9412349984',
      totalMarginUsed: '2044300.6489879999',
    },
    crossMarginSummary: {
      accountValue: '4101762.727651',
      totalNtlPos: '40531830.6688859984',
      totalRawUsd: '-36430067.9412349984',
      totalMarginUsed: '2044300.6489879999',
    },
    crossMaintenanceMarginUsed: '1022150.3244939999',
    withdrawable: '0.0',
    assetPositions: [
      {
        type: 'oneWay',
        position: {
          coin: 'ETH',
          szi: '12500.0',
          leverage: { type: 'cross', value: 25 },
          entryPx: '2593.6',
          positionValue: '34316250.0',
          unrealizedPnl: '1896217.3276800001',
          returnOnEquity: '1.4622265706',
          liquidationPx: '2202.4488521418',
          marginUsed: '1372650.0',
          maxLeverage: 25,
          cumFunding: {
            allTime: '223060.962831',
            sinceOpen: '27519.428155',
            sinceChange: '24306.741498',
          },
        },
      },
      {
        type: 'oneWay',
        position: {
          coin: 'NEAR',
          szi: '970359.0',
          leverage: { type: 'cross', value: 10 },
          entryPx: '4.14515',
          positionValue: '4299078.5136000002',
          unrealizedPnl: '276793.80193',
          returnOnEquity: '0.6881506949',
          liquidationPx: null,
          marginUsed: '429907.85136',
          maxLeverage: 10,
          cumFunding: {
            allTime: '9024.0684',
            sinceOpen: '9024.0684',
            sinceChange: '5660.053901',
          },
        },
      },
      {
        type: 'oneWay',
        position: {
          coin: 'PENGU',
          szi: '54460298.0',
          leverage: { type: 'cross', value: 5 },
          entryPx: '0.009123',
          positionValue: '500925.821004',
          unrealizedPnl: '4079.910216',
          returnOnEquity: '0.041058104',
          liquidationPx: null,
          marginUsed: '100185.1642',
          maxLeverage: 5,
          cumFunding: {
            allTime: '73.275606',
            sinceOpen: '73.275606',
            sinceChange: '73.275606',
          },
        },
      },
      {
        type: 'oneWay',
        position: {
          coin: 'XPL',
          szi: '15073113.0',
          leverage: { type: 'cross', value: 10 },
          entryPx: '0.098404',
          positionValue: '1415576.3342820001',
          unrealizedPnl: '-67681.675027',
          returnOnEquity: '-0.4563041265',
          liquidationPx: null,
          marginUsed: '141557.633428',
          maxLeverage: 10,
          cumFunding: {
            allTime: '689.665093',
            sinceOpen: '689.665093',
            sinceChange: '0.0',
          },
        },
      },
    ],
    time: 1790091087693,
  },
  spotClearinghouseState: {
    portfolioMarginEnabled: true,
    balances: [
      {
        coin: 'USDC',
        token: 0,
        total: '7678466.9041772699',
        hold: '4104640.2134164399',
        entryNtl: '0.0',
        ltv: '0.0',
        supplied: '3571618.63923227',
      },
      {
        coin: 'MUNCH',
        token: 146,
        total: '7.43118',
        hold: '0.0',
        entryNtl: '0.00002749',
      },
      {
        coin: 'HYPE',
        token: 150,
        total: '0.00338262',
        hold: '0.0',
        entryNtl: '0.20616725',
        ltv: '0.65',
      },
      {
        coin: 'STAR',
        token: 154,
        total: '0.01435139',
        hold: '0.0',
        entryNtl: '0.00000143',
      },
      {
        coin: 'UBTC',
        token: 197,
        total: '0.0',
        hold: '0.0',
        entryNtl: '0.0',
        ltv: '0.5',
      },
      { coin: 'USDE', token: 235, total: '0.0', hold: '0.0', entryNtl: '0.0' },
      { coin: 'USOL', token: 254, total: '0.0', hold: '0.0', entryNtl: '0.0' },
      {
        coin: 'USDT0',
        token: 268,
        total: '0.0',
        hold: '0.0',
        entryNtl: '0.0',
        ltv: '0.0',
      },
      {
        coin: 'LICKO',
        token: 307,
        total: '220.32122253',
        hold: '0.0',
        entryNtl: '0.00132192',
      },
      {
        coin: 'USDH',
        token: 360,
        total: '0.0',
        hold: '0.0',
        entryNtl: '0.0',
        ltv: '0.0',
      },
      {
        coin: 'MAX',
        token: 734,
        total: '6923.026638',
        hold: '0.0',
        entryNtl: '0.0',
      },
    ],
    portfolioMarginRatio: '0.133131833',
    tokenToPortfolioBorrowRatio: [[0, '0.0']],
    tokenToPortfolioSupplyRatio: [
      [150, '0.0'],
      [197, '0.0'],
    ],
    tokenToAvailableAfterMaintenance: [
      [0, '6656218.5307019101'],
      [150, '0.00338262'],
      [197, '0.0'],
      [268, '0.0'],
      [360, '0.0'],
    ],
  },
  openOrders: null,
  activeAssetData: {
    ETH: {
      user: '0xbf732ea04197942783e34730ed6e0f6099575d58',
      coin: 'ETH',
      leverage: { type: 'cross', value: 25 },
      maxTradeSzs: ['23919.5237', '48919.5237'],
      availableToTrade: ['5633169.6935090004', '8379750.1542779999'],
      markPx: '2745.78',
    },
    NEAR: {
      user: '0xbf732ea04197942783e34730ed6e0f6099575d58',
      coin: 'NEAR',
      leverage: { type: 'cross', value: 10 },
      maxTradeSzs: ['3547066.8999999999', '5487784.9000000004'],
      availableToTrade: ['5646420.0997519996', '6505634.1798919998'],
      markPx: '4.4273',
    },
    PENGU: {
      user: '0xbf732ea04197942783e34730ed6e0f6099575d58',
      coin: 'PENGU',
      leverage: { type: 'cross', value: 5 },
      maxTradeSzs: ['3071377362.0', '3180297958.0'],
      availableToTrade: ['5646420.1423000004', '5846659.7659870004'],
      markPx: '0.009192',
    },
    XPL: {
      user: '0xbf732ea04197942783e34730ed6e0f6099575d58',
      coin: 'XPL',
      leverage: { type: 'cross', value: 10 },
      maxTradeSzs: ['16765673.0', '47082453.0'],
      availableToTrade: ['5643328.9470849996', '5928224.823779'],
      markPx: '0.093973',
    },
  },
}

/**
 * Spot mids recorded alongside {@link PM_SNAPSHOT}. Only HYPE and MAX have a
 * market fixture; MUNCH, STAR, and LICKO have no recorded market and price to
 * `0` through the SDK's documented missing-price fallback.
 */
export const PM_PRICES: MarketContext[] = [
  { marketId: '@107', midPrice: '94.919', markPrice: '94.919' },
  { marketId: '@591', midPrice: '0.0000002', markPrice: '0.0000002' },
]

export const PM_WITHDRAWABLE = PM_SNAPSHOT.clearinghouseState.withdrawable
export const PM_AVAILABLE_TO_TRADE_ETH =
  PM_SNAPSHOT.activeAssetData.ETH.availableToTrade
export const PM_AVAILABLE_TO_TRADE_NEAR =
  PM_SNAPSHOT.activeAssetData.NEAR.availableToTrade
export const PM_AVAILABLE_TO_TRADE_PENGU =
  PM_SNAPSHOT.activeAssetData.PENGU.availableToTrade
export const PM_AVAILABLE_TO_TRADE_XPL =
  PM_SNAPSHOT.activeAssetData.XPL.availableToTrade

// ---------------------------------------------------------------------------
// Market fixtures. Spot `baseAsset.id` is the token index string, matching
// `spotAssetFromToken`'s asset id, so `spotPriceById` resolves the recorded
// mids above.
// ---------------------------------------------------------------------------

const perpAsset = (symbol: string) => ({
  providerId: 'hyperliquid',
  id: symbol,
  displaySymbol: symbol,
  logoURI: '',
})

const spotAsset = (symbol: string, tokenId: string) => ({
  providerId: 'hyperliquid',
  id: tokenId,
  displaySymbol: symbol,
  logoURI: '',
})

const perpMarket = (
  id: string,
  szDecimals: number,
  maxLeverage: number
): Market => ({
  providerId: 'hyperliquid',
  id,
  categoryId: 'hyperliquid',
  baseAsset: perpAsset(id),
  quoteAsset: USDC_ASSET,
  szDecimals,
  maxLeverage,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
})

const spotMarket = (id: string, symbol: string, tokenId: string): Market => ({
  providerId: 'hyperliquid',
  id,
  categoryId: 'spot',
  baseAsset: spotAsset(symbol, tokenId),
  quoteAsset: USDC_ASSET,
  szDecimals: 6,
})

export const MEGA_MARKET: Market = perpMarket('MEGA', 0, 3)
export const HYPE_PERP_MARKET: Market = perpMarket('HYPE', 2, 10)
export const ETH_PERP_MARKET: Market = perpMarket('ETH', 4, 25)
export const NEAR_PERP_MARKET: Market = perpMarket('NEAR', 1, 10)
export const PENGU_PERP_MARKET: Market = perpMarket('PENGU', 0, 5)
export const XPL_PERP_MARKET: Market = perpMarket('XPL', 1, 10)

export const BRIDGE_SPOT_MARKET: Market = spotMarket('@219', 'BRIDGE', '73')
export const HYPE_SPOT_MARKET: Market = spotMarket('@107', 'HYPE', '150')
export const BASED_SPOT_MARKET: Market = spotMarket('@305', 'BASED', '339')
export const MAX_SPOT_MARKET: Market = spotMarket('@591', 'MAX', '734')

export const UNIFIED_MARKETS: Market[] = [
  MEGA_MARKET,
  BRIDGE_SPOT_MARKET,
  HYPE_SPOT_MARKET,
  BASED_SPOT_MARKET,
  MAX_SPOT_MARKET,
]

export const STANDARD_MARKETS: Market[] = [
  HYPE_PERP_MARKET,
  BRIDGE_SPOT_MARKET,
  HYPE_SPOT_MARKET,
  MAX_SPOT_MARKET,
]

export const PM_MARKETS: Market[] = [
  ETH_PERP_MARKET,
  NEAR_PERP_MARKET,
  PENGU_PERP_MARKET,
  XPL_PERP_MARKET,
  HYPE_SPOT_MARKET,
  MAX_SPOT_MARKET,
]
