import { MarginMode, PositionSide } from '../../../enums.js'
import type { Position } from '../../../account.js'
import type { LtAccountPosition } from '../apiTypes.js'
import { LT_MARGIN_MODE_ISOLATED } from '../types.js'

/**
 * Map a raw Lighter account position to the generic Position type.
 * @param pos - Raw position from REST or WS
 * @param symbol - Resolved symbol (market_id → symbol lookup, or pos.symbol)
 */
export const mapPosition = (
  pos: LtAccountPosition,
  symbol: string
): Position => {
  const size = parseFloat(pos.position)

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
    leverage:
      parseFloat(pos.initial_margin_fraction) > 0
        ? Math.round(10_000 / parseFloat(pos.initial_margin_fraction))
        : 1,
    marginUsed: pos.allocated_margin,
    marginMode:
      pos.margin_mode === LT_MARGIN_MODE_ISOLATED
        ? MarginMode.ISOLATED
        : MarginMode.CROSS,
  }
}
