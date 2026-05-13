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
  const isIsolated = pos.margin_mode === LT_MARGIN_MODE_ISOLATED

  // Lighter only writes `allocated_margin` for isolated positions — on a cross
  // account margin is implicit and the field is always "0". For cross
  // positions, derive margin the way Lighter's own UI does:
  //   margin = position_value × initial_margin_fraction / 100
  // (IMF is reported in percent units, so imf=2.00 ⇒ 2% ⇒ 50× leverage).
  // Verified against /api/v1/account for cross accounts 5, 24, 80 and the
  // isolated USDJPY position on account 24 (where allocated_margin is the
  // source of truth and may exceed pv × imf / 100 due to over-collateralization).
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
