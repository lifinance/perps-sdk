import {
  compareDecimalStrings,
  isDecimalString,
  isDecimalStringZero,
  wsLog,
} from '@lifi/perps-sdk'
import type { LtWsOrderBook } from '../types/index.js'

/**
 * Orders two decimal-string prices: a negative result puts `a` before `b`.
 *
 * @throws {PerpsError} `ValidationError` when a price is not a decimal string.
 */
export type PriceOrder = (a: string, b: string) => number

export const bidOrder: PriceOrder = (a, b) => compareDecimalStrings(b, a)
export const askOrder: PriceOrder = (a, b) => compareDecimalStrings(a, b)

interface BookLevel {
  price: string
  size: string
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
      if (!isDecimalString(price)) {
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
        const level = { price, size }
        this.byPrice.set(price, level)
        // Upper bound: a new level lands after equal prices, as a stable sort
        // of the map in insertion order would place it.
        this.levels.splice(
          this.bound(level.price, (c) => c > 0),
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
        this.bound(existing.price, (c) => c >= 0)
      ),
      1
    )
  }

  private bound(price: string, isPast: (cmp: number) => boolean): number {
    let lo = 0
    let hi = this.levels.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (isPast(this.order(this.levels[mid].price, price))) {
        hi = mid
      } else {
        lo = mid + 1
      }
    }
    return lo
  }
}
