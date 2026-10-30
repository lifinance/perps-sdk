import {
  type Market,
  PositionMarginAdjustment,
  type Provider,
  SigningMethod,
} from '@lifi/perps-types'
import type {
  HlClearinghouseState,
  HlExtraAgents,
  HlFrontendOpenOrders,
  HlMetaAndAssetCtxs,
  HlOrderDetail,
  HlOrderStatusResponse,
  HlPerpDexs,
  HlSpotClearinghouseState,
  HlTwapHistoryEntry,
  HlTwapSliceFill,
  HlUserFees,
  HlUserFills,
  HlUserFunding,
  HlUserNonFundingLedgerUpdates,
} from '../src/types/index.js'

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

// Quote/collateral asset. HL spot `Asset.id` is the token index (USDC = 0).
export const USDC_ASSET = {
  providerId: 'hyperliquid',
  id: '0',
  displaySymbol: 'USDC',
  logoURI: '',
}

/** Backend `/providers` descriptor. Hyperliquid charges a flat 1 USDC withdrawal fee. */
export const HYPERLIQUID_PROVIDER: Provider = {
  key: 'hyperliquid',
  name: 'Hyperliquid',
  logoURI: '',
  signingMethod: SigningMethod.EIP712,
  active: true,
  setup: [],
  actions: [],
  categories: [],
  supportedIntervals: [],
  withdrawalFeeUsd: '1',
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
    maxLeverage: 50,
    onlyIsolated: false,
    positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  },
  {
    providerId: 'hyperliquid',
    id: 'ETH',
    categoryId: 'hyperliquid',
    baseAsset: baseAsset('ETH'),
    quoteAsset: USDC_ASSET,
    szDecimals: 4,
    maxLeverage: 50,
    onlyIsolated: false,
    positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  },
]

export const HL_DELISTED_MARKET: Market = {
  providerId: 'hyperliquid',
  id: 'DELISTED',
  categoryId: 'hyperliquid',
  baseAsset: baseAsset('DELISTED'),
  quoteAsset: USDC_ASSET,
  szDecimals: 0,
  maxLeverage: 10,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  isDelisted: true,
}

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
}

const HL_MARGIN_SUMMARY = {
  accountValue: '10000',
  totalNtlPos: '9500',
  totalRawUsd: '500',
  totalMarginUsed: '940',
}

export const HL_CLEARINGHOUSE_STATE: HlClearinghouseState = {
  marginSummary: HL_MARGIN_SUMMARY,
  crossMarginSummary: HL_MARGIN_SUMMARY,
  crossMaintenanceMarginUsed: '470',
  withdrawable: '9060',
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
        cumFunding: {
          allTime: '-23403.892773',
          sinceOpen: '5.788917',
          sinceChange: '0.0',
        },
      },
    },
  ],
}

export const HL_SPOT_CLEARINGHOUSE_STATE: HlSpotClearinghouseState = {
  balances: [
    { coin: 'USDC', token: 0, total: '500', hold: '0', entryNtl: '0' },
  ],
  tokenToAvailableAfterMaintenance: [[0, '500']],
}

/**
 * Spot state of a unified account: the whole account lives in spot, so USDC
 * `total` is {@link HL_CLEARINGHOUSE_STATE}'s `accountValue` and `hold` is the
 * perps equity it backs.
 */
export const HL_UNIFIED_SPOT_CLEARINGHOUSE_STATE: HlSpotClearinghouseState = {
  balances: [
    { coin: 'USDC', token: 0, total: '10000', hold: '10000', entryNtl: '0' },
  ],
  tokenToAvailableAfterMaintenance: [[0, '9060']],
}

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

export const HL_ORDER_DETAIL_FOUND: HlOrderDetail = {
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
}

export const HL_ORDER_STATUS_FOUND: HlOrderStatusResponse = {
  status: 'order',
  order: HL_ORDER_DETAIL_FOUND,
}

/** `orderStatus` for the found order placed with a client order id. */
export const HL_ORDER_STATUS_FOUND_WITH_CLOID: HlOrderStatusResponse = {
  status: 'order',
  order: {
    ...HL_ORDER_DETAIL_FOUND,
    order: {
      ...HL_ORDER_DETAIL_FOUND.order,
      cloid: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  },
}

/** `orderStatus` for an order on an HIP-4 outcome market. */
export const HL_ORDER_STATUS_OUTCOME: HlOrderStatusResponse = {
  status: 'order',
  order: {
    ...HL_ORDER_DETAIL_FOUND,
    order: { ...HL_ORDER_DETAIL_FOUND.order, coin: '#26140' },
  },
}

export const HL_ORDER_STATUS_UNKNOWN: HlOrderStatusResponse = {
  status: 'unknownOid',
}

/** `twapHistory` of one finished ETH TWAP, newest row first as the venue sends it. */
export const HL_TWAP_HISTORY_FINISHED: HlTwapHistoryEntry[] = [
  {
    twapId: 2329352,
    time: 1_792_155_172,
    status: { status: 'finished' },
    state: {
      coin: 'ETH',
      executedNtl: '167.58',
      executedSz: '0.042',
      minutes: 5,
      side: 'B',
      sz: '0.042',
      timestamp: 1_792_154_930_000,
      reduceOnly: false,
    },
  },
  {
    twapId: 2329352,
    time: 1_792_154_930,
    status: { status: 'activated' },
    state: {
      coin: 'ETH',
      executedNtl: '0.0',
      executedSz: '0.0',
      minutes: 5,
      side: 'B',
      sz: '0.042',
      timestamp: 1_792_154_930_000,
      reduceOnly: false,
    },
  },
]

const twapSliceFill = (
  twapId: number,
  fill: Pick<HlTwapSliceFill['fill'], 'tid' | 'oid' | 'sz' | 'px' | 'time'>
): HlTwapSliceFill => ({
  twapId,
  fill: {
    coin: 'ETH',
    side: 'B',
    dir: 'Open Long',
    fee: '0.008442',
    feeToken: 'USDC',
    closedPnl: '0.0',
    crossed: true,
    hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    startPosition: '0.0',
    ...fill,
  },
})

/**
 * `userTwapSliceFills` newest first: two slices of the ETH TWAP in
 * {@link HL_TWAP_HISTORY_FINISHED} (0.0094 at an average of 3991), then one
 * slice of a different TWAP.
 */
export const HL_TWAP_SLICE_FILLS: HlTwapSliceFill[] = [
  twapSliceFill(2329352, {
    tid: 5002,
    oid: 4002,
    sz: '0.0047',
    px: '3992',
    time: 1_792_154_990_000,
  }),
  twapSliceFill(2329351, {
    tid: 5001,
    oid: 4001,
    sz: '0.01',
    px: '3900',
    time: 1_792_154_970_000,
  }),
  twapSliceFill(2329352, {
    tid: 5000,
    oid: 4000,
    sz: '0.0047',
    px: '3990',
    time: 1_792_154_960_000,
  }),
]

/** The `activated` `twapHistory` row of a running ETH TWAP of 40. */
export const HL_TWAP_LONG_ACTIVATED: HlTwapHistoryEntry = {
  twapId: 2329400,
  time: 1_792_154_930,
  status: { status: 'activated' },
  state: {
    coin: 'ETH',
    executedNtl: '0.0',
    executedSz: '0.0',
    minutes: 1_440,
    side: 'B',
    sz: '40',
    timestamp: 1_792_154_930_000,
    reduceOnly: false,
  },
}

/**
 * 3,000 slice fills of {@link HL_TWAP_LONG_ACTIVATED}, oldest first, one each
 * 30 s: 1,000 of 0.01 at 100, then 2,000 of 0.01 at 130 (30 at an average of 120).
 */
export const HL_TWAP_LONG_SLICE_FILLS: HlTwapSliceFill[] = Array.from(
  { length: 3_000 },
  (_, index) =>
    twapSliceFill(2329400, {
      tid: 10_000 + index,
      oid: 20_000 + index,
      sz: '0.01',
      px: index < 1_000 ? '100' : '130',
      time: 1_792_154_930_000 + (index + 1) * 30_000,
    })
)

/**
 * One `userTwapSliceFillsByTime` row of a public account, in the shape the
 * venue returned it. `userFillsByTime` for the same range omits its trade ID.
 */
export const HL_TWAP_SLICE_FILL_REFERENCE: HlTwapSliceFill = {
  twapId: 2455234,
  fill: {
    coin: 'ETH',
    px: '3101.5',
    sz: '0.0161',
    side: 'A',
    time: 1_793_300_120_247,
    startPosition: '0.4523',
    dir: 'Close Long',
    closedPnl: '1.288',
    hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    oid: 590716607007,
    crossed: true,
    fee: '0.022455',
    tid: 648473049019291,
    feeToken: 'USDC',
  },
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

export const HL_DELISTED_USER_FILLS: HlUserFills = [
  {
    ...HL_USER_FILLS[0],
    coin: 'DELISTED',
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

export const HL_DELISTED_USER_FUNDING: HlUserFunding = [
  {
    ...HL_USER_FUNDING[0],
    delta: {
      ...HL_USER_FUNDING[0].delta,
      coin: 'DELISTED',
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
