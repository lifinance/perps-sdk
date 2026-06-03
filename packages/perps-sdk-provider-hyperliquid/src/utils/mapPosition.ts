import type { MarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import type { HlAssetPosition } from '../types/index.js'

/** @public */
export const mapPosition = (
  ap: HlAssetPosition,
  market: MarketDisplay
): Position => {
  const pos = ap.position
  const szi = parseFloat(pos.szi)

  return {
    market,
    side: szi >= 0 ? PositionSide.LONG : PositionSide.SHORT,
    size: Math.abs(szi).toString(),
    entryPrice: pos.entryPx ?? '0',
    markPrice:
      pos.positionValue && szi !== 0
        ? (parseFloat(pos.positionValue) / Math.abs(szi)).toString()
        : '0',
    liquidationPrice: pos.liquidationPx ?? '0',
    unrealizedPnl: pos.unrealizedPnl,
    leverage: ap.position.leverage.value,
    marginUsed: pos.marginUsed,
    marginMode:
      ap.position.leverage.type === 'cross'
        ? MarginMode.CROSS
        : MarginMode.ISOLATED,
  }
}
