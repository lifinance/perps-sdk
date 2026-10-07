import {
  decimalStringToNumber,
  isDecimalString,
  isDecimalStringZero,
  wsLog,
} from '@lifi/perps-sdk'
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

  constructor(
    private readonly order: PriceOrder,
    private readonly providerKey: string
  ) {}

  /**
   * Applies snapshot or delta levels; a zero size deletes the level. A level
   * with an invalid size also deletes the level at its price, so the book
   * never keeps a size the venue has replaced.
   */
  apply(updates: LtWsOrderBook['bids']): void {
    for (const { price, size } of updates) {
      const priceNum = decimalStringToNumber(price)
      if (priceNum === undefined) {
        wsLog.skippedRow(this.providerKey, 'order book level', 'price', price)
        continue
      }
      if (!isDecimalString(size)) {
        wsLog.skippedRow(this.providerKey, 'order book level', 'size', size)
        this.remove(price)
        continue
      }
      if (isDecimalStringZero(size)) {
        this.remove(price)
        continue
      }
      const existing = this.byPrice.get(price)
      if (existing) {
        existing.size = size
      } else {
        const level = { price, size, priceNum }
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

  private remove(price: string): void {
    const existing = this.byPrice.get(price)
    if (existing === undefined) {
      return
    }
    this.byPrice.delete(price)
    this.levels.splice(
      this.levels.indexOf(
        existing,
        this.bound(existing.priceNum, (c) => c >= 0)
      ),
      1
    )
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
