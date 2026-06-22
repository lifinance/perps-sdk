// Asset / market metadata returned by Hyperliquid `/info`.

/** @public */
export type HlUniverseItem = {
  name: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated?: boolean
  isDelisted?: boolean
}

/** @public */
export type HlMeta = {
  universe: HlUniverseItem[]
}

/** @public */
export type HlAssetCtx = {
  funding: string
  openInterest: string
  dayNtlVlm: string
  prevDayPx: string
  markPx: string
}

/** @public */
export type HlMetaAndAssetCtxs = [HlMeta, HlAssetCtx[]]

/** @public */
export type HlUniverse = HlMeta['universe']

/** @public */
export type HlAllMids = Record<string, string>

/** @public */
export type HlCandle = {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

/** @public */
export type HlCandleSnapshot = HlCandle[]

/** @public */
export type HlLevel = {
  px: string
  sz: string
  n: number
}

/** @public */
export type HlL2Book = {
  levels: [HlLevel[], HlLevel[]]
  time: number
}

/** @public */
export type HlPerpDexs = (null | { name: string })[]

/** @public */
export type HlSpotToken = {
  name: string
  index: number
  tokenId: string
  szDecimals: number
}

/** @public */
export type HlSpotUniverseEntry = {
  name: string
  tokens: [number, number]
  index: number
  isCanonical: boolean
}

/** @public */
export type HlSpotMeta = {
  tokens: HlSpotToken[]
  universe: HlSpotUniverseEntry[]
}

/** @public */
export type HlSpotAssetCtx = {
  coin: string
  prevDayPx: string
  dayNtlVlm: string
  markPx: string
  midPx: string | null
}

/** @public */
export type HlSpotMetaAndAssetCtxs = [HlSpotMeta, HlSpotAssetCtx[]]
