import {
  MarginMode,
  type OpenOrder,
  OrderSide,
  OrderType,
  type Position,
  PositionSide,
  type TriggerOrder,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  expectedRealizedPnlForOpenOrder,
  expectedRealizedPnlForTriggerOrder,
  findMatchingPosition,
} from './orderMath.js'

const baseAsset = (symbol: string) => ({
  providerId: 'hyperliquid',
  id: symbol,
  displaySymbol: symbol,
  logoURI: `https://x/${symbol}.png`,
})

const USDC = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://x/usdc.png',
}

const MARKET_BTC = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: baseAsset('BTC'),
  quoteAsset: USDC,
}

const MARKET_ETH = {
  providerId: 'hyperliquid',
  id: 'ETH',
  categoryId: 'hyperliquid',
  baseAsset: baseAsset('ETH'),
  quoteAsset: USDC,
}

function position(
  overrides: Partial<Position> & Pick<Position, 'side' | 'size' | 'entryPrice'>
): Position {
  return {
    market: MARKET_BTC,
    markPrice: '0',
    liquidationPrice: '0',
    unrealizedPnl: '0',
    leverage: 1,
    marginUsed: '0',
    marginMode: MarginMode.CROSS,
    ...overrides,
  }
}

function openOrder(
  overrides: Partial<OpenOrder> & Pick<OpenOrder, 'side' | 'size' | 'price'>
): OpenOrder {
  return {
    id: 'order-1',
    market: MARKET_BTC,
    type: OrderType.LIMIT,
    filledSize: '0',
    reduceOnly: false,
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function triggerOrder(
  overrides: Partial<TriggerOrder> & Pick<TriggerOrder, 'size' | 'triggerPrice'>
): TriggerOrder {
  return {
    id: 'trigger-1',
    market: MARKET_BTC,
    type: OrderType.TAKE_PROFIT_MARKET,
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('findMatchingPosition', () => {
  it('finds the position whose marketId matches', () => {
    const btc = position({
      side: PositionSide.LONG,
      size: '1',
      entryPrice: '100',
      market: MARKET_BTC,
    })
    const eth = position({
      side: PositionSide.SHORT,
      size: '5',
      entryPrice: '3000',
      market: MARKET_ETH,
    })
    expect(findMatchingPosition('BTC', [btc, eth])).toBe(btc)
    expect(findMatchingPosition('ETH', [btc, eth])).toBe(eth)
  })

  it('returns undefined when no position matches', () => {
    const btc = position({
      side: PositionSide.LONG,
      size: '1',
      entryPrice: '100',
    })
    expect(findMatchingPosition('SOL', [btc])).toBeUndefined()
  })
})

describe('expectedRealizedPnlForOpenOrder', () => {
  it('computes profit for a SELL order reducing a long', () => {
    // 1 BTC long @ 100, sell limit at 150 => +50
    const r = expectedRealizedPnlForOpenOrder(
      openOrder({ side: OrderSide.SELL, size: '1', price: '150' }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(50, 9)
  })

  it('computes loss for a SELL order reducing a long below entry', () => {
    const r = expectedRealizedPnlForOpenOrder(
      openOrder({ side: OrderSide.SELL, size: '2', price: '80' }),
      position({ side: PositionSide.LONG, size: '2', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(-40, 9)
  })

  it('computes profit for a BUY order reducing a short', () => {
    // 2 BTC short @ 100, buy limit at 80 => +40
    const r = expectedRealizedPnlForOpenOrder(
      openOrder({ side: OrderSide.BUY, size: '2', price: '80' }),
      position({ side: PositionSide.SHORT, size: '2', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(40, 9)
  })

  it('computes loss for a BUY order reducing a short above entry', () => {
    const r = expectedRealizedPnlForOpenOrder(
      openOrder({ side: OrderSide.BUY, size: '1', price: '120' }),
      position({ side: PositionSide.SHORT, size: '1', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(-20, 9)
  })

  it('caps order size at the position size', () => {
    // long 1 BTC @ 100, sell 5 BTC @ 150 — only 1 BTC actually closes => +50
    const r = expectedRealizedPnlForOpenOrder(
      openOrder({ side: OrderSide.SELL, size: '5', price: '150' }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(50, 9)
  })

  it('returns null when the order matches no position', () => {
    const r = expectedRealizedPnlForOpenOrder(
      openOrder({ side: OrderSide.SELL, size: '1', price: '150' }),
      undefined
    )
    expect(r).toBeNull()
  })

  it('returns null for a same-side BUY against a long (adds to the position)', () => {
    const r = expectedRealizedPnlForOpenOrder(
      openOrder({ side: OrderSide.BUY, size: '1', price: '90' }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBeNull()
  })

  it('returns null for a same-side SELL against a short (adds to the short)', () => {
    const r = expectedRealizedPnlForOpenOrder(
      openOrder({ side: OrderSide.SELL, size: '1', price: '110' }),
      position({ side: PositionSide.SHORT, size: '1', entryPrice: '100' })
    )
    expect(r).toBeNull()
  })

  it('treats a signed position size correctly via its absolute value', () => {
    // SDK Position.size for a short can serialise as "-1"; the cap should
    // still see 1 BTC of close-able size.
    const r = expectedRealizedPnlForOpenOrder(
      openOrder({ side: OrderSide.BUY, size: '5', price: '80' }),
      position({ side: PositionSide.SHORT, size: '-1', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(20, 9) // (100 - 80) * 1 = +20
  })
})

describe('expectedRealizedPnlForTriggerOrder', () => {
  it('computes profit for a TP on a long at trigger > entry', () => {
    const r = expectedRealizedPnlForTriggerOrder(
      triggerOrder({ size: '1', triggerPrice: '150' }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(50, 9)
  })

  it('computes loss for a SL on a long at trigger < entry', () => {
    const r = expectedRealizedPnlForTriggerOrder(
      triggerOrder({
        size: '1',
        triggerPrice: '90',
        type: OrderType.STOP_MARKET,
      }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(-10, 9)
  })

  it('computes profit for a TP on a short at trigger < entry', () => {
    const r = expectedRealizedPnlForTriggerOrder(
      triggerOrder({ size: '2', triggerPrice: '80' }),
      position({ side: PositionSide.SHORT, size: '2', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(40, 9)
  })

  it('uses the full position size when order.size is zero (close-position trigger)', () => {
    // Hyperliquid encodes "close entire position" as size === 0 on the trigger
    const r = expectedRealizedPnlForTriggerOrder(
      triggerOrder({ size: '0', triggerPrice: '150' }),
      position({ side: PositionSide.LONG, size: '3', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(150, 9) // (150 - 100) * 3
  })

  it('caps an oversized trigger size at the position size', () => {
    const r = expectedRealizedPnlForTriggerOrder(
      triggerOrder({ size: '10', triggerPrice: '80' }),
      position({ side: PositionSide.SHORT, size: '2', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(40, 9) // capped to 2 short
  })

  it('uses triggerPrice, not the optional limitPrice, as the rPnL price', () => {
    // STOP_LIMIT — limitPrice is the post-trigger limit, not the rPnL price
    const r = expectedRealizedPnlForTriggerOrder(
      triggerOrder({
        size: '1',
        triggerPrice: '90',
        limitPrice: '85',
        type: OrderType.STOP_LIMIT,
      }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBeCloseTo(-10, 9) // priced off triggerPrice (90), not limitPrice (85)
  })

  it('returns null when the trigger has no matching position', () => {
    const r = expectedRealizedPnlForTriggerOrder(
      triggerOrder({ size: '1', triggerPrice: '150' }),
      undefined
    )
    expect(r).toBeNull()
  })
})
