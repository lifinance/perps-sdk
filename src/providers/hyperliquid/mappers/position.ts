import { MarginMode, PositionSide } from '../../../enums.js'
import type { Position } from '../../../account.js'
import type { HlAssetPosition } from '../types.js'

export const mapPosition = (ap: HlAssetPosition): Position => {
  const pos = ap.position
  const szi = parseFloat(pos.szi)

  return {
    asset: {
      assetId: pos.coin,
      market: '',
      displaySymbol: pos.coin,
      displayQuote: null,
    },
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
