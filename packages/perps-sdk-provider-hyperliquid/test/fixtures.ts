import type { Market } from '@lifi/perps-types'
import type {
  HlClearinghouseState,
  HlExtraAgents,
  HlFrontendOpenOrders,
  HlMetaAndAssetCtxs,
  HlOrderStatusResponse,
  HlPerpDexs,
  HlSpotClearinghouseState,
  HlUserFees,
  HlUserFills,
  HlUserFunding,
  HlUserNonFundingLedgerUpdates,
} from '@lifi/perps-types/providers/hyperliquid'

export const HL_PERP_DEXS_MAIN_ONLY: HlPerpDexs = [null]

export const HL_PERP_DEXS_WITH_XYZ: HlPerpDexs = [null, { name: 'xyz' }]

export const HL_META_AND_CTXS_MAIN: HlMetaAndAssetCtxs = [
  {
    universe: [
      { name: 'BTC', szDecimals: 5, maxLeverage: 50, onlyIsolated: false },
      { name: 'ETH', szDecimals: 4, maxLeverage: 50, onlyIsolated: false },
      {
        name: 'DELISTED',
        szDecimals: 0,
        maxLeverage: 10,
        onlyIsolated: false,
        isDelisted: true,
      },
    ],
  },
  [
    {
      funding: '0.0001',
      openInterest: '1000',
      dayNtlVlm: '50000',
      prevDayPx: '94000',
      markPx: '95000',
    },
    {
      funding: '0.00005',
      openInterest: '500',
      dayNtlVlm: '20000',
      prevDayPx: '3300',
      markPx: '3400',
    },
    {
      funding: '0',
      openInterest: '0',
      dayNtlVlm: '0',
      prevDayPx: '0',
      markPx: '0',
    },
  ],
]

export const HL_META_AND_CTXS_XYZ: HlMetaAndAssetCtxs = [
  {
    universe: [
      { name: 'PURR', szDecimals: 0, maxLeverage: 5, onlyIsolated: true },
    ],
  },
  [
    {
      funding: '0.0002',
      openInterest: '10',
      dayNtlVlm: '100',
      prevDayPx: '0.5',
      markPx: '0.6',
    },
  ],
]

export const HL_META_AND_CTXS_MAIN_WITH_COLLATERAL: unknown = [
  // For getProviderMarkets the first element is treated as { collateralToken }
  { collateralToken: 0, universe: [] },
  [],
]

const USDC_ASSET = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: '',
}

const baseAsset = (symbol: string) => ({
  providerId: 'hyperliquid',
  id: symbol,
  displaySymbol: symbol,
  logoURI: '',
})

/**
 * Backend-sourced market list for account-read specs — what
 * `getMarkets({ provider: 'hyperliquid' })` returns. Main perps only, BTC + ETH
 * on USDC.
 */
export const HL_MARKETS: Market[] = [
  {
    providerId: 'hyperliquid',
    id: 'BTC',
    categoryId: 'hyperliquid',
    baseAsset: baseAsset('BTC'),
    quoteAsset: USDC_ASSET,
    szDecimals: 5,
    markPrice: '95000',
    maxLeverage: 50,
    onlyIsolated: false,
    funding: { rate: '0', nextFundingTime: 0 },
  },
  {
    providerId: 'hyperliquid',
    id: 'ETH',
    categoryId: 'hyperliquid',
    baseAsset: baseAsset('ETH'),
    quoteAsset: USDC_ASSET,
    szDecimals: 4,
    markPrice: '3400',
    maxLeverage: 50,
    onlyIsolated: false,
    funding: { rate: '0', nextFundingTime: 0 },
  },
]

/**
 * Backend spot market: the venue references it by coin `@142`, the backend
 * lists it under `id: '@142'` with an enriched `BTC/USDC` display and a
 * `_spot` logo. `HL_MARKETS` omits it so the same fixtures exercise the
 * unlisted-fallback path.
 */
export const HL_SPOT_MARKET: Market = {
  providerId: 'hyperliquid',
  id: '@142',
  categoryId: 'spot',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'BTC',
    displaySymbol: 'BTC/USDC',
    logoURI: 'https://app.hyperliquid.xyz/coins/BTC_spot.svg',
  },
  quoteAsset: USDC_ASSET,
  szDecimals: 5,
  markPrice: '95000',
  maxLeverage: 1,
  onlyIsolated: false,
  funding: { rate: '0', nextFundingTime: 0 },
}

export const HL_CLEARINGHOUSE_STATE: HlClearinghouseState = {
  marginSummary: { accountValue: '10000', totalMarginUsed: '500' },
  crossMarginSummary: { accountValue: '10000', totalMarginUsed: '500' },
  assetPositions: [
    {
      position: {
        coin: 'BTC',
        szi: '0.1',
        entryPx: '94000',
        positionValue: '9500',
        liquidationPx: '85000',
        unrealizedPnl: '100',
        marginUsed: '940',
        leverage: { type: 'cross', value: 10 },
      },
    },
  ],
}

export const HL_SPOT_CLEARINGHOUSE_STATE: HlSpotClearinghouseState = {
  balances: [
    { coin: 'USDC', token: 0, total: '500', hold: '0', entryNtl: '0' },
  ],
}

/**
 * Spot account holding a non-collateral token (`PURR`, token 1) alongside the
 * USDC collateral. `PURR` shares no symbol with any perp; its spot pair `@107`
 * marks at `0.5`, so the holding values at `100 * 0.5 = 50`.
 */
export const HL_SPOT_CLEARINGHOUSE_STATE_WITH_HOLDING: HlSpotClearinghouseState =
  {
    balances: [
      { coin: 'USDC', token: 0, total: '500', hold: '0', entryNtl: '0' },
      { coin: 'PURR', token: 1, total: '100', hold: '40', entryNtl: '20' },
    ],
  }

/** `HL_MARKETS` plus the spot `PURR/USDC` pair (`@107`) marking at `0.5`. */
export const HL_MARKETS_WITH_SPOT: Market[] = [
  ...HL_MARKETS,
  {
    providerId: 'hyperliquid',
    id: '@107',
    categoryId: 'spot',
    baseAsset: {
      providerId: 'hyperliquid',
      id: 'PURR',
      displaySymbol: 'PURR/USDC',
      logoURI: 'https://app.hyperliquid.xyz/coins/PURR_spot.svg',
    },
    quoteAsset: USDC_ASSET,
    szDecimals: 2,
    markPrice: '0.5',
    maxLeverage: 1,
    onlyIsolated: false,
    funding: { rate: '0', nextFundingTime: 0 },
  } as Market,
]

export const HL_USER_FEES: HlUserFees = {
  userAddRate: '0.0002',
  userCrossRate: '0.0005',
  activeReferralDiscount: '0',
}

export const HL_EXTRA_AGENTS: HlExtraAgents = [
  { address: '0xabc', name: 'agent-1', validUntil: 1900000000000 },
]

export const HL_FRONTEND_OPEN_ORDERS: HlFrontendOpenOrders = [
  {
    oid: 1,
    coin: 'BTC',
    side: 'B',
    sz: '0.05',
    limitPx: '93000',
    orderType: 'Limit',
    origSz: '0.05',
    reduceOnly: false,
    timestamp: 1704067200000,
    isTrigger: false,
    isPositionTpsl: false,
    triggerCondition: 'N/A',
    triggerPx: '0',
    children: [],
    tif: 'Gtc',
    cloid: null,
  },
  {
    oid: 2,
    coin: 'BTC',
    side: 'S',
    sz: '0.05',
    limitPx: '0',
    orderType: 'Stop Market',
    origSz: '0.05',
    reduceOnly: true,
    timestamp: 1704067200000,
    isTrigger: true,
    isPositionTpsl: false,
    triggerCondition: 'Below 90000',
    triggerPx: '90000',
    children: [],
    tif: null,
    cloid: null,
  },
]

export const HL_ORDER_STATUS_FOUND: HlOrderStatusResponse = {
  status: 'order',
  order: {
    order: {
      oid: 1,
      coin: 'BTC',
      side: 'B',
      sz: '0',
      limitPx: '94000',
      orderType: 'Limit',
      origSz: '0.05',
      reduceOnly: false,
      timestamp: 1704067200000,
      tif: 'Gtc',
      cloid: null,
      triggerCondition: 'N/A',
      triggerPx: null,
    },
    status: 'filled',
    statusTimestamp: 1704067201000,
  },
}

export const HL_ORDER_STATUS_UNKNOWN: HlOrderStatusResponse = {
  status: 'unknownOid',
}

export const HL_USER_FILLS: HlUserFills = [
  {
    tid: 100,
    oid: 1,
    coin: 'BTC',
    side: 'B',
    sz: '0.1',
    px: '94000',
    dir: 'Open Long',
    fee: '4.70',
    closedPnl: '0',
    crossed: true,
    time: 1704067200000,
    startPosition: '0',
  },
]

export const HL_SPOT_USER_FILLS: HlUserFills = [
  {
    tid: 101,
    oid: 2,
    coin: '@142',
    side: 'B',
    sz: '0.1',
    px: '94000',
    dir: 'Buy',
    fee: '4.70',
    closedPnl: '0',
    crossed: true,
    time: 1704067200000,
    startPosition: '0',
  },
]

export const HL_USER_FUNDING: HlUserFunding = [
  {
    time: 1704067200000,
    hash: '0xfund1',
    delta: {
      type: 'funding',
      coin: 'BTC',
      usdc: '2.5',
      szi: '0.1',
      fundingRate: '0.0001',
    },
  },
]

export const HL_USER_NON_FUNDING_LEDGER: HlUserNonFundingLedgerUpdates = [
  {
    time: 1704067200000,
    hash: '0xdep1',
    delta: { type: 'deposit', usdc: '5000' },
  },
]

export const HL_ALL_MIDS = { BTC: '95000', ETH: '3400' }

export const HL_L2_BOOK = {
  coin: 'BTC',
  time: 1704067200000,
  levels: [
    [
      { px: '94999', sz: '1.5', n: 3 },
      { px: '94998', sz: '2', n: 4 },
    ],
    [
      { px: '95001', sz: '1', n: 2 },
      { px: '95002', sz: '1.5', n: 3 },
    ],
  ],
}

export const HL_CANDLE_SNAPSHOT = [
  {
    t: 1704067200000,
    o: '94000',
    h: '95000',
    l: '93500',
    c: '94800',
    v: '100',
  },
  {
    t: 1704070800000,
    o: '94800',
    h: '95500',
    l: '94500',
    c: '95000',
    v: '120',
  },
]
