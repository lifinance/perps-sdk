import type { Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import type { LtAccountPosition } from '@lifi/perps-types/providers/lighter'
import { LT_MARGIN_MODE_ISOLATED } from '@lifi/perps-types/providers/lighter'

/**
 * Map a raw Lighter account position to the generic Position type.
 * @param symbol Resolved symbol (market_id → symbol lookup, or `pos.symbol`).
 */
export const mapPosition = (
  pos: LtAccountPosition,
  symbol: string
): Position => {
  const size = parseFloat(pos.position)
  const isIsolated = pos.margin_mode === LT_MARGIN_MODE_ISOLATED

  // `allocated_margin` is only populated for isolated positions (always "0"
  // on cross accounts). For cross, derive margin as
  // `position_value × initial_margin_fraction / 100` (IMF is in percent).
  const positionValue = Math.abs(parseFloat(pos.position_value))
  const imf = parseFloat(pos.initial_margin_fraction)
  const marginUsed = isIsolated
    ? pos.allocated_margin
    : ((positionValue * imf) / 100).toString()

  return {
    asset: {
      assetId: symbol,
      market: 'lighter',
      displaySymbol: symbol,
      displayQuote: 'USDC',
    },
    side: pos.sign >= 0 ? PositionSide.LONG : PositionSide.SHORT,
    size: Math.abs(size).toString(),
    entryPrice: pos.avg_entry_price,
    markPrice:
      pos.position_value === '0' || size === 0
        ? '0'
        : (parseFloat(pos.position_value) / Math.abs(size)).toString(),
    liquidationPrice: pos.liquidation_price,
    unrealizedPnl: pos.unrealized_pnl,
    leverage: imf > 0 ? Math.round(100 / imf) : 1,
    marginUsed,
    marginMode: isIsolated ? MarginMode.ISOLATED : MarginMode.CROSS,
  }
}
