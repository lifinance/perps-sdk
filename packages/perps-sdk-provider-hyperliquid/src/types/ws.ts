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

/**
 * Partial perp context carried by compressed (`pac`) updates. Omitted fields
 * are unchanged from the prior context and must be merged by the consumer.
 * @public
 */
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

/** Generic Hyperliquid WS envelope; `channel` identifies the subscription and `data` is channel-specific. @public */
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

/**
 * Incremental spot asset context. Hyperliquid may encode numeric fields as
 * strings or numbers and omits unchanged fields; `midPx: null` means no book
 * midpoint is available.
 * @public
 */
export type HlWsSpotAssetCtx = {
  dayNtlVlm?: HlWsNumberString
  prevDayPx?: HlWsNumberString
  markPx?: HlWsNumberString
  midPx?: HlWsNumberString | null
  dayBaseVlm?: HlWsNumberString
  circulatingSupply?: HlWsNumberString
}

/** Active perp context event keyed by its Hyperliquid wire coin. @public */
export type HlWsActiveAssetCtxData = {
  coin: string
  ctx: Partial<Record<keyof HlWsPerpAssetCtx, HlWsNumberString | null>>
}

/** Active spot context event keyed by its Hyperliquid wire coin. @public */
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

/** L2 snapshot envelope with the wire coin attached to {@link HlL2Book}. @public */
export type HlWsL2BookData = HlL2Book & { coin: string }

/**
 * L2 channel payload. `s` is a full snapshot, while `u` is a compressed delta;
 * `c` carries the checksum/control value when present.
 * @public
 */
export type HlWsL2Data = {
  s?: HlL2Book & { coin: string }
  c?: string
  u?: HlWsCompressedL2Data
}

/** One level in a compressed L2 update: `p` is price and `s` is size. @public */
export type HlWsCompressedL2Level = {
  p: string
  s: string
}

/**
 * Compressed L2 delta. `t` is the update timestamp in milliseconds, `l` holds
 * bid/ask levels, and optional `r` describes removals.
 * @public
 */
export type HlWsCompressedL2Data = {
  c: string
  t: number
  l: [HlWsCompressedL2Level[], HlWsCompressedL2Level[]]
  r?: [
    Array<number | string | { p: string }>,
    Array<number | string | { p: string }>,
  ]
}

/**
 * Candle event payload. Inherited `t` is candle-open time; `T` is close time,
 * `s` is the symbol, `i` is interval, and `n` is the trade count.
 * @public
 */
export type HlWsCandleData = HlCandle & {
  T: number
  s: string
  i: string
  n: number
}

/**
 * Public trade event. Prices and size are decimal strings; `time` is
 * milliseconds since epoch, with optional trade ID and transaction hash.
 * @public
 */
export type HlWsTrade = {
  coin: string
  side: string
  px: string
  sz: string
  time: number
  tid?: number
  hash?: string
}

/** User fills event; `isSnapshot` distinguishes the initial snapshot from updates. @public */
export type HlWsUserFillsData = {
  isSnapshot: boolean
  user: string
  fills: HlUserFill[]
}

/**
 * Per-dex clearinghouse event for one user. Each tuple contains a wire DEX name
 * and the perp positions/equity fields supplied by that DEX.
 * @public
 */
export type HlWsAllDexsClearinghouseStateData = {
  user: string
  clearinghouseStates: [
    string,
    Pick<HlClearinghouseState, 'assetPositions' | 'marginSummary'>,
  ][]
}

/** User spot clearinghouse event containing the current spot balances. @public */
export type HlWsSpotStateData = {
  user: string
  spotState: { balances: HlSpotBalance[] }
}
