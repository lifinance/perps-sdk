import type { LtWsOrderBook } from '../types/index.js'

/** Orders two prices: a negative result puts `a` before `b`. */
export type PriceOrder = (a: number, b: number) => number

export const bidOrder: PriceOrder = (a, b) => b - a
export const askOrder: PriceOrder = (a, b) => a - b

interface BookLevel {
  price: string
  size: string
  priceNum: number
}

/**
 * One side of a maintained order book, keyed by the wire price string. Levels
 * stay in `order` across updates, so a read copies them without a sort.
 */
export class OrderBookSide {
  private readonly byPrice = new Map<string, BookLevel>()
  private readonly levels: BookLevel[] = []

  constructor(private readonly order: PriceOrder) {}

  /** Applies snapshot or delta levels; a zero size deletes the level. */
  apply(updates: LtWsOrderBook['bids']): void {
    for (const { price, size } of updates) {
      const existing = this.byPrice.get(price)
      if (size === '0' || Number(size) === 0) {
        if (existing) {
          this.byPrice.delete(price)
          this.levels.splice(
            this.levels.indexOf(
              existing,
              this.bound(existing.priceNum, (c) => c >= 0)
            ),
            1
          )
        }
      } else if (existing) {
        existing.size = size
      } else {
        const level = { price, size, priceNum: Number(price) }
        this.byPrice.set(price, level)
        // Upper bound: a new level lands after equal prices, as a stable sort
        // of the map in insertion order would place it.
        this.levels.splice(
          this.bound(level.priceNum, (c) => c > 0),
          0,
          level
        )
      }
    }
  }

  toLevels(): Array<{ price: string; size: string }> {
    return this.levels.map(({ price, size }) => ({ price, size }))
  }

  private bound(priceNum: number, isPast: (cmp: number) => boolean): number {
    let lo = 0
    let hi = this.levels.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (isPast(this.order(this.levels[mid].priceNum, priceNum))) {
        hi = mid
      } else {
        lo = mid + 1
      }
    }
    return lo
  }
}
