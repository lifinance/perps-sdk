import {
  MarginMode,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { positionMarginConstraints } from './transferMargin.js'

const position: Position = {
  market: {
    providerId: 'ondo',
    id: 'ETH',
    categoryId: 'perps',
    baseAsset: {
      providerId: 'ondo',
      id: 'ETH',
      displaySymbol: 'ETH',
      logoURI: '',
    },
    quoteAsset: {
      providerId: 'ondo',
      id: 'USDC',
      displaySymbol: 'USDC',
      logoURI: '',
    },
    positionMarginAdjustment: PositionMarginAdjustment.NONE,
  },
  side: PositionSide.LONG,
  size: '1',
  entryPrice: '100',
  markPrice: '100',
  liquidationPrice: '0',
  unrealizedPnl: '0',
  accruedFunding: '0',
  leverage: 1,
  marginUsed: '100',
  initialMarginRequirement: '100',
  marginMode: MarginMode.CROSS,
}

describe('positionMarginConstraints', () => {
  it('reports no per-position margin adjustment', () => {
    expect(positionMarginConstraints(position)).toBeUndefined()
  })
})
