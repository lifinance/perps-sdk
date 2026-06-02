// Asset / market metadata returned by Hyperliquid `/info`.

export type HlUniverseItem = {
  name: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated?: boolean
  isDelisted?: boolean
}

export type HlMeta = {
  universe: HlUniverseItem[]
}

export type HlAssetCtx = {
  funding: string
  openInterest: string
  dayNtlVlm: string
  prevDayPx: string
  markPx: string
}

export type HlMetaAndAssetCtxs = [HlMeta, HlAssetCtx[]]

export type HlUniverse = HlMeta['universe']

export type HlAllMids = Record<string, string>

export type HlCandle = {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

export type HlCandleSnapshot = HlCandle[]

export type HlLevel = {
  px: string
  sz: string
  n: number
}

export type HlL2Book = {
  levels: [HlLevel[], HlLevel[]]
  time: number
}

export type HlPerpDexs = (null | { name: string })[]
