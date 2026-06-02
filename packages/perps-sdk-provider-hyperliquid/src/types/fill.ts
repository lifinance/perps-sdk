// Fill shapes returned by Hyperliquid `/info`.

/** @public */
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

/** @public */
export type HlUserFills = HlUserFill[]

/** @public */
export type HlUserFillsByTime = HlUserFill[]
