// Hyperliquid WebSocket incoming message types.

import type { HlClearinghouseState, HlSpotBalance } from './account.js'
import type { HlAllMids, HlCandle, HlL2Book } from './asset.js'
import type { HlUserFill } from './fill.js'

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
export type HlWsClearinghouseStateData = {
  dex: string
  user: string
  clearinghouseState: Pick<HlClearinghouseState, 'assetPositions'>
}

/** @public */
export type HlWsSpotClearinghouseStateData = {
  user: string
  balances: HlSpotBalance[]
}
