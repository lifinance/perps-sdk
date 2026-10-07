import { describe, expect, it } from 'vitest'
import {
  askOrder,
  bidOrder,
  OrderBookSide,
  type PriceOrder,
} from './orderBookSide.js'

type WireLevel = { price: string; size: string }

const countingOrder = (order: PriceOrder) => {
  const counter = {
    calls: 0,
    order: (a: number, b: number) => {
      counter.calls++
      return order(a, b)
    },
  }
  return counter
}

/** Copies and sorts the full side on each delta, for comparison. */
class FullSortReference {
  private readonly book = new Map<string, { size: string; priceNum: number }>()

  constructor(private readonly order: PriceOrder) {}

  apply(levels: WireLevel[]): void {
    for (const level of levels) {
      if (level.size === '0' || Number(level.size) === 0) {
        this.book.delete(level.price)
      } else {
        const existing = this.book.get(level.price)
        if (existing) {
          existing.size = level.size
        } else {
          this.book.set(level.price, {
            size: level.size,
            priceNum: Number(level.price),
          })
        }
      }
    }
  }

  toLevels(): WireLevel[] {
    return [...this.book]
      .sort(([, a], [, b]) => this.order(a.priceNum, b.priceNum))
      .map(([price, { size }]) => ({ price, size }))
  }
}

// Deterministic LCG so the replay is identical on every run.
const seeded = (seed: number) => {
  let state = seed
  return (n: number) => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state % n
  }
}

const tickPrice = (tick: number) => (tick / 10).toFixed(1)

/**
 * A 200-level side plus 100 deltas. Each delta resizes, deletes and inserts
 * levels, and sometimes deletes a price that is not in the book.
 */
const buildReplay = (seed: number, firstTick: number, step: 1 | -1) => {
  const rand = seeded(seed)
  const live = new Set<number>()
  const snapshot: WireLevel[] = []
  for (let i = 0; i < 200; i++) {
    const tick = firstTick + step * i * 2
    live.add(tick)
    snapshot.push({ price: tickPrice(tick), size: `${1 + rand(50)}.25` })
  }
  const deltas: WireLevel[][] = []
  for (let d = 0; d < 100; d++) {
    const delta: WireLevel[] = []
    const ticks = [...live]
    const resize = ticks[rand(ticks.length)]
    delta.push({ price: tickPrice(resize), size: `${rand(90) + 1}.5` })
    const removed = ticks[rand(ticks.length)]
    if (removed !== resize) {
      live.delete(removed)
      delta.push({ price: tickPrice(removed), size: '0' })
    }
    const added = firstTick + step * rand(450)
    if (!live.has(added) && added !== removed) {
      live.add(added)
      delta.push({ price: tickPrice(added), size: `${rand(20) + 1}` })
    }
    if (d % 10 === 0) {
      delta.push({ price: tickPrice(firstTick + step * 999), size: '0.0' })
    }
    deltas.push(delta)
  }
  return { snapshot, deltas }
}

const replaySide = (
  order: PriceOrder,
  replay: ReturnType<typeof buildReplay>
) => {
  const incrementalCount = countingOrder(order)
  const referenceCount = countingOrder(order)
  const side = new OrderBookSide(incrementalCount.order)
  const reference = new FullSortReference(referenceCount.order)

  side.apply(replay.snapshot)
  reference.apply(replay.snapshot)
  incrementalCount.calls = 0
  referenceCount.calls = 0

  const emitted: WireLevel[][] = []
  const expected: WireLevel[][] = []
  for (const delta of replay.deltas) {
    side.apply(delta)
    reference.apply(delta)
    emitted.push(side.toLevels())
    expected.push(reference.toLevels())
  }
  return {
    emitted,
    expected,
    incrementalCalls: incrementalCount.calls,
    referenceCalls: referenceCount.calls,
  }
}

const isOrdered = (levels: WireLevel[], order: PriceOrder) =>
  levels.every(
    (level, i) =>
      i === 0 || order(Number(levels[i - 1].price), Number(level.price)) < 0
  )

describe('OrderBookSide', () => {
  describe('100-delta replay on a 200-level book', () => {
    const bidReplay = buildReplay(7, 50_000, -1)
    const askReplay = buildReplay(11, 50_002, 1)
    const bids = replaySide(bidOrder, bidReplay)
    const asks = replaySide(askOrder, askReplay)

    it('does at least 90% less comparator work than a per-delta full sort', () => {
      const incremental = bids.incrementalCalls + asks.incrementalCalls
      const reference = bids.referenceCalls + asks.referenceCalls
      expect(reference).toBeGreaterThan(0)
      expect(incremental).toBeLessThanOrEqual(reference * 0.1)
    })

    it('emits each book equal to the per-delta full sort', () => {
      expect(bids.emitted).toEqual(bids.expected)
      expect(asks.emitted).toEqual(asks.expected)
    })

    it('emits bids descending and asks ascending', () => {
      for (const levels of bids.emitted) {
        expect(isOrdered(levels, bidOrder)).toBe(true)
      }
      for (const levels of asks.emitted) {
        expect(isOrdered(levels, askOrder)).toBe(true)
      }
    })

    it('applies deletions', () => {
      for (const [replay, side] of [
        [bidReplay, bids],
        [askReplay, asks],
      ] as const) {
        replay.deltas.forEach((delta, i) => {
          const emittedPrices = new Set(side.emitted[i].map((l) => l.price))
          for (const level of delta) {
            if (Number(level.size) === 0) {
              expect(emittedPrices.has(level.price)).toBe(false)
            }
          }
        })
      }
    })
  })

  it('places a new level after an equal price, as a stable sort does', () => {
    const side = new OrderBookSide(askOrder)
    side.apply([
      { price: '100', size: '1' },
      { price: '101', size: '2' },
      { price: '100.0', size: '3' },
    ])
    expect(side.toLevels()).toEqual([
      { price: '100', size: '1' },
      { price: '100.0', size: '3' },
      { price: '101', size: '2' },
    ])

    side.apply([{ price: '100.0', size: '0' }])
    expect(side.toLevels()).toEqual([
      { price: '100', size: '1' },
      { price: '101', size: '2' },
    ])
  })

  it('ignores a deletion of a price that is not in the book', () => {
    const side = new OrderBookSide(bidOrder)
    side.apply([{ price: '100', size: '1' }])
    side.apply([{ price: '99', size: '0' }])
    expect(side.toLevels()).toEqual([{ price: '100', size: '1' }])
  })

  it('returns a fresh array that a caller cannot use to change the book', () => {
    const side = new OrderBookSide(bidOrder)
    side.apply([{ price: '100', size: '1' }])
    const first = side.toLevels()
    first[0].size = '9'
    first.pop()
    expect(side.toLevels()).toEqual([{ price: '100', size: '1' }])
  })
})
