// Hyperliquid WebSocket incoming message types.

import type { HlClearinghouseState, HlSpotBalance } from './account.js'
import type { HlAllMids, HlCandle, HlL2Book } from './asset.js'
import type { HlUserFill } from './fill.js'

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
 * `allDexsAssetCtxs` carries one `[dex, ctxs]` pair per perp sub-DEX, mirroring
 * `allDexsClearinghouseState`. Spot contexts arrive separately.
 * @public
 */
export type HlWsAllDexsAssetCtxsData = {
  assetCtxs: [string, HlWsPerpAssetCtx[]][]
}

/** @public */
export type HlWsMessage = {
  channel: string
  data: unknown
}

/** @public */
export type HlWsAllMidsData = {
  mids: HlAllMids
  dex?: string
}

/** @public */
export type HlWsL2BookData = HlL2Book & { coin: string }

/** @public */
export type HlWsCandleData = HlCandle & {
  T: number
  s: string
  i: string
  n: number
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
  clearinghouseStates: [string, Pick<HlClearinghouseState, 'assetPositions'>][]
}

/** @public */
export type HlWsSpotStateData = {
  user: string
  spotState: { balances: HlSpotBalance[] }
}
