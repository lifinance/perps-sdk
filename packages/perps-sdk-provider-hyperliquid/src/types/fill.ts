// ---------------------------------------------------------------------------
// Fill shapes returned by Hyperliquid `/info`.
// ---------------------------------------------------------------------------

export type HlUserFill = {
  tid: number
  oid: number
  coin: string
  side: string
  sz: string
  px: string
  dir: string
  fee: string
  closedPnl: string
  crossed: boolean
  time: number
  startPosition: string
}

export type HlUserFills = HlUserFill[]

export type HlUserFillsByTime = HlUserFill[]
