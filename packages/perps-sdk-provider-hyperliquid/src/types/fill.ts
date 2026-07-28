// Fill shapes returned by Hyperliquid `/info`.

/**
 * One user trade fill returned by Hyperliquid `userFills` or
 * `userFillsByTime`. Prices, size, fee, PnL, and starting position are decimal
 * strings; `time` is milliseconds since the Unix epoch and `tid`/`oid` are
 * numeric trade and order IDs.
 * @public
 */
export type HlUserFill = {
  tid: number
  oid: number
  hash?: string
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

/** All fills returned by the unbounded `userFills` query. @public */
export type HlUserFills = HlUserFill[]

/** Fills returned by the time-bounded `userFillsByTime` query. @public */
export type HlUserFillsByTime = HlUserFill[]
