import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import Big from 'big.js'
import type { HlAssetPosition } from '../types/index.js'

/**
 * True when the assetPosition has non-zero size. Hyperliquid keeps zero-size
 * rows in clearinghouse states after a close; both the REST and WS positions
 * paths drop them so a close surfaces as absence from the open set.
 * @public
 */
export const isOpenAssetPosition = (ap: HlAssetPosition): boolean =>
  Number.parseFloat(ap.position.szi) !== 0

/** @public */
export const mapPosition = (
  ap: HlAssetPosition,
  market: PerpsMarketDisplay
): Position => {
  const pos = ap.position
  const szi = new Big(pos.szi)
  const positionValue = new Big(pos.positionValue).abs()
  const leverage = new Big(pos.leverage.value)
  const marginMode =
    pos.leverage.type === 'cross' ? MarginMode.CROSS : MarginMode.ISOLATED
  const marginUsed =
    marginMode === MarginMode.ISOLATED
      ? new Big(pos.marginUsed).minus(pos.unrealizedPnl).toFixed()
      : pos.marginUsed

  return {
    market,
    side: szi.gte(0) ? PositionSide.LONG : PositionSide.SHORT,
    size: szi.abs().toFixed(),
    entryPrice: pos.entryPx ?? '0',
    markPrice: szi.eq(0) ? '0' : positionValue.div(szi.abs()).toFixed(),
    liquidationPrice: pos.liquidationPx ?? '0',
    unrealizedPnl: pos.unrealizedPnl,
    leverage: ap.position.leverage.value,
    marginUsed,
    initialMarginRequirement: positionValue.div(leverage).toFixed(),
    marginMode,
  }
}
