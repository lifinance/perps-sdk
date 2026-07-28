import { describe, expect, it } from 'vitest'
import type { Position } from './account.js'
import { MarginMode, PositionMarginAdjustment, PositionSide } from './enums.js'
import {
  positionSupportsMarginAdjustment,
  positionSupportsMarginRemoval,
} from './positionMargin.js'

const position = (
  marginMode: MarginMode,
  positionMarginAdjustment: PositionMarginAdjustment
): Position => ({
  market: {
    providerId: 'hyperliquid',
    id: 'BTC',
    categoryId: 'perps',
    baseAsset: {
      providerId: 'hyperliquid',
      id: 'BTC',
      displaySymbol: 'BTC',
      logoURI: '',
    },
    quoteAsset: {
      providerId: 'hyperliquid',
      id: 'USDC',
      displaySymbol: 'USDC',
      logoURI: '',
    },
    positionMarginAdjustment,
  },
  side: PositionSide.LONG,
  size: '1',
  entryPrice: '100000',
  markPrice: '100000',
  liquidationPrice: '90000',
  unrealizedPnl: '0',
  leverage: 10,
  marginUsed: '10000',
  initialMarginRequirement: '10000',
  marginMode,
})

describe('positionSupportsMarginAdjustment', () => {
  it.each([
    PositionMarginAdjustment.ADD_ONLY,
    PositionMarginAdjustment.ADD_AND_REMOVE,
  ])('permits an adjustment on an isolated %s market', (capability) => {
    expect(
      positionSupportsMarginAdjustment(
        position(MarginMode.ISOLATED, capability)
      )
    ).toBe(true)
  })

  it('refuses an adjustment when the market exposes no position margin', () => {
    expect(
      positionSupportsMarginAdjustment(
        position(MarginMode.ISOLATED, PositionMarginAdjustment.NONE)
      )
    ).toBe(false)
  })

  it.each([
    PositionMarginAdjustment.NONE,
    PositionMarginAdjustment.ADD_ONLY,
    PositionMarginAdjustment.ADD_AND_REMOVE,
  ])('refuses an adjustment on a cross position of a %s market', (capability) => {
    expect(
      positionSupportsMarginAdjustment(position(MarginMode.CROSS, capability))
    ).toBe(false)
  })
})

describe('positionSupportsMarginRemoval', () => {
  it('permits a removal on an isolated ADD_AND_REMOVE market', () => {
    expect(
      positionSupportsMarginRemoval(
        position(MarginMode.ISOLATED, PositionMarginAdjustment.ADD_AND_REMOVE)
      )
    ).toBe(true)
  })

  it.each([
    PositionMarginAdjustment.ADD_ONLY,
    PositionMarginAdjustment.NONE,
  ])('refuses a removal on an isolated %s market', (capability) => {
    expect(
      positionSupportsMarginRemoval(position(MarginMode.ISOLATED, capability))
    ).toBe(false)
  })

  it('refuses a removal on a cross position of an ADD_AND_REMOVE market', () => {
    expect(
      positionSupportsMarginRemoval(
        position(MarginMode.CROSS, PositionMarginAdjustment.ADD_AND_REMOVE)
      )
    ).toBe(false)
  })

  it.each([
    [MarginMode.ISOLATED, PositionMarginAdjustment.NONE],
    [MarginMode.ISOLATED, PositionMarginAdjustment.ADD_ONLY],
    [MarginMode.ISOLATED, PositionMarginAdjustment.ADD_AND_REMOVE],
    [MarginMode.CROSS, PositionMarginAdjustment.NONE],
    [MarginMode.CROSS, PositionMarginAdjustment.ADD_ONLY],
    [MarginMode.CROSS, PositionMarginAdjustment.ADD_AND_REMOVE],
  ] as const)('never permits a removal an adjustment forbids (%s, %s)', (marginMode, capability) => {
    const subject = position(marginMode, capability)

    expect(
      positionSupportsMarginRemoval(subject) &&
        !positionSupportsMarginAdjustment(subject)
    ).toBe(false)
  })
})
