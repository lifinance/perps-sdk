// ---------------------------------------------------------------------------
// Hyperliquid WebSocket incoming message types.
// ---------------------------------------------------------------------------

import type { HlClearinghouseState } from './account.js'
import type { HlAllMids, HlCandle, HlL2Book } from './asset.js'
import type { HlUserFill } from './fill.js'

export type HlWsMessage = {
  channel: string
  data: unknown
}

export type HlWsAllMidsData = {
  mids: HlAllMids
  dex?: string
}

export type HlWsL2BookData = HlL2Book & { coin: string }

export type HlWsCandleData = HlCandle & {
  T: number
  s: string
  i: string
  n: number
}

export type HlWsUserFillsData = {
  isSnapshot: boolean
  user: string
  fills: HlUserFill[]
}

export type HlWsClearinghouseStateData = {
  dex: string
  user: string
  clearinghouseState: Pick<HlClearinghouseState, 'assetPositions'>
}

export type HlWsSpotClearinghouseStateData = {
  user: string
  balances: Array<{ coin: string; total: string; hold: string }>
}
