// Asset / market metadata returned by Hyperliquid `/info`.

/**
 * Perpetual market metadata from Hyperliquid `meta.universe`.
 * `szDecimals` is the lot-size precision; `maxLeverage` is the venue cap.
 * @public
 */
export type HlUniverseItem = {
  name: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated?: boolean
  /** Current replacement for deprecated `onlyIsolated`. */
  marginMode?: 'strictIsolated' | 'noCross'
  isDelisted?: boolean
}

/**
 * Descending leverage thresholds and USD market-order caps from the
 * `maxMarketOrderNtls` info query.
 * @public
 */
export type HlMaxMarketOrderNtls = Array<
  [minMaxLeverage: number, maxMarketOrderUsd: string]
>

/**
 * Perpetual metadata envelope returned by the Hyperliquid `meta` info query.
 * @public
 */
export type HlMeta = {
  universe: HlUniverseItem[]
}

/**
 * Live perpetual market context from Hyperliquid `metaAndAssetCtxs`.
 * Prices, funding, open interest, and volume are decimal strings; `funding`
 * is a rate and `dayNtlVlm` is 24-hour notional volume.
 * @public
 */
export type HlAssetCtx = {
  funding: string
  openInterest: string
  dayNtlVlm: string
  prevDayPx: string
  markPx: string
}

/**
 * Tuple returned by `metaAndAssetCtxs`: static universe metadata followed by
 * one live context per universe entry.
 * @public
 */
export type HlMetaAndAssetCtxs = [HlMeta, HlAssetCtx[]]

/** Alias for the perpetual universe array in {@link HlMeta}. @public */
export type HlUniverse = HlMeta['universe']

/**
 * OHLCV candle from Hyperliquid's candle feed. `t` is the opening timestamp
 * in milliseconds; prices and volume are decimal strings.
 * @public
 */
export type HlCandle = {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

/** Snapshot array of {@link HlCandle} values, ordered by the upstream feed. @public */
export type HlCandleSnapshot = HlCandle[]

/**
 * One L2 order-book level. `px` is price, `sz` is aggregate size, and `n` is
 * the number of orders at that price; numeric values are wire strings except
 * for the order count.
 * @public
 */
export type HlLevel = {
  px: string
  sz: string
  n: number
}

/**
 * L2 order-book snapshot with bid levels at index 0 and ask levels at index 1.
 * `time` is the snapshot timestamp in milliseconds.
 * @public
 */
export type HlL2Book = {
  levels: [HlLevel[], HlLevel[]]
  time: number
}

/**
 * Perpetual DEX descriptors from Hyperliquid `perpDexs`; `null` represents the
 * main DEX and named entries represent HIP-3 sub-DEXes.
 * @public
 */
export type HlPerpDexs = (null | { name: string })[]

/**
 * Spot token metadata. `index` is the numeric token index used by spot
 * clearinghouse balances; `tokenId` is the venue's wire identifier.
 * @public
 */
export type HlSpotToken = {
  name: string
  index: number
  tokenId: string
  szDecimals: number
}

/**
 * Spot universe entry describing a trading pair. `tokens` contains the two
 * numeric token indexes used by the pair.
 * @public
 */
export type HlSpotUniverseEntry = {
  name: string
  tokens: [number, number]
  index: number
  isCanonical: boolean
}

/** Spot metadata envelope containing token definitions and trading pairs. @public */
export type HlSpotMeta = {
  tokens: HlSpotToken[]
  universe: HlSpotUniverseEntry[]
}

/**
 * Live spot token context. Prices and 24-hour volume are decimal strings;
 * `midPx` is `null` when the venue has no midpoint for the pair.
 * @public
 */
export type HlSpotAssetCtx = {
  coin: string
  prevDayPx: string
  dayNtlVlm: string
  markPx: string
  midPx: string | null
}

/** Tuple returned by the spot metadata/context info query. @public */
export type HlSpotMetaAndAssetCtxs = [HlSpotMeta, HlSpotAssetCtx[]]
