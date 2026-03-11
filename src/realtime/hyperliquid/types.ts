// Hyperliquid WebSocket incoming message types
// Derived from @lifi/perps-types where possible to avoid duplication.

import type {
  HlAllMids,
  HlCandle,
  HlClearinghouseState,
  HlL2Book,
  HlUserFill,
} from '@lifi/perps-types/providers/hyperliquid'

export type HlWsMessage = {
  channel: string
  data: unknown
}

export type HlWsAllMidsData = {
  mids: HlAllMids
}

export type HlWsL2BookData = HlL2Book & { coin: string }

export type HlWsTrade = {
  coin: string
  side: string
  px: string
  sz: string
  time: number
  tid: number
}

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
