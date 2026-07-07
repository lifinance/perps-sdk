// Hyperliquid WebSocket incoming message types.

import type { HlClearinghouseState, HlSpotBalance } from './account.js'
import type { HlCandle, HlL2Book } from './asset.js'
import type { HlUserFill } from './fill.js'

type HlWsNumberString = string | number

/**
 * Perp asset context as carried on the `allDexsAssetCtxs` WS feed. Extends the
 * REST `/info` `HlAssetCtx` shape with the wire-only `coin` tag, the order-book
 * `midPx` (null when the book is empty), and `oraclePx`.
 * @public
 */
export type HlWsPerpAssetCtx = {
  coin: string
  funding: string
  openInterest: string
  dayNtlVlm: string
  prevDayPx: string
  markPx: string
  midPx: string | null
  oraclePx: string
}

/** @public */
export type HlWsPerpAssetCtxPayload = Partial<HlWsPerpAssetCtx>

/**
 * `allDexsAssetCtxs` carries one `[dex, ctxs]` pair per perp sub-DEX, mirroring
 * `allDexsClearinghouseState`. Spot contexts arrive separately.
 * @public
 */
export type HlWsAllDexsAssetCtxsData = {
  assetCtxs?: [string, HlWsPerpAssetCtx[]][]
  ctxs?: [string, HlWsPerpAssetCtxPayload[]][]
}

/**
 * Compressed perp asset-context feed. Snapshot/update frames carry one
 * `[dex, ctxs]` pair per perp sub-DEX. Updates can omit unchanged fields inside
 * each context.
 * @public
 */
export type HlWsPacData = [string, HlWsPerpAssetCtxPayload[]][]

/** @public */
export type HlWsMessage = {
  channel: string
  data: unknown
}

/**
 * Per-coin entry from the compressed `fastAssetCtxs` feed (mark + mid only,
 * keyed by coin across all dexes). `midPx` is null when the book is empty;
 * fields are omitted from incremental frames when unchanged.
 * @public
 */
export type HlWsFastAssetCtx = {
  markPx?: string
  midPx?: string | null
}

/** @public */
export type HlWsSpotAssetCtx = {
  dayNtlVlm?: HlWsNumberString
  prevDayPx?: HlWsNumberString
  markPx?: HlWsNumberString
  midPx?: HlWsNumberString | null
  dayBaseVlm?: HlWsNumberString
  circulatingSupply?: HlWsNumberString
}

/** @public */
export type HlWsActiveAssetCtxData = {
  coin: string
  ctx: Partial<Record<keyof HlWsPerpAssetCtx, HlWsNumberString | null>>
}

/** @public */
export type HlWsActiveSpotAssetCtxData = {
  coin: string
  ctx: HlWsSpotAssetCtx
}

/**
 * Compressed spot asset-context feed. The first frame is a broad snapshot; later
 * frames only carry changed fields.
 * @public
 */
export type HlWsSacData = Record<string, HlWsSpotAssetCtx>

/** @public */
export type HlWsL2BookData = HlL2Book & { coin: string }

/** @public */
export type HlWsL2Data = {
  s?: HlL2Book & { coin: string }
  c?: string
  u?: HlWsCompressedL2Data
}

/** @public */
export type HlWsCompressedL2Level = {
  p: string
  s: string
}

/** @public */
export type HlWsCompressedL2Data = {
  c: string
  t: number
  l: [HlWsCompressedL2Level[], HlWsCompressedL2Level[]]
  r?: [
    Array<number | string | { p: string }>,
    Array<number | string | { p: string }>,
  ]
}

/** @public */
export type HlWsCandleData = HlCandle & {
  T: number
  s: string
  i: string
  n: number
}

/** @public */
export type HlWsTrade = {
  coin: string
  side: string
  px: string
  sz: string
  time: number
  tid?: number
  hash?: string
}

/** @public */
export type HlWsUserFillsData = {
  isSnapshot: boolean
  user: string
  fills: HlUserFill[]
}

/** @public */
export type HlWsAllDexsClearinghouseStateData = {
  user: string
  clearinghouseStates: [
    string,
    Pick<HlClearinghouseState, 'assetPositions' | 'marginSummary'>,
  ][]
}

/** @public */
export type HlWsSpotStateData = {
  user: string
  spotState: { balances: HlSpotBalance[] }
}
