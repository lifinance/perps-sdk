import type { MarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import Big from 'big.js'
import type { LtAccountPosition } from '../types/index.js'
import { LT_MARGIN_MODE_ISOLATED } from '../types/index.js'

/**
 * Configured leverage from an IMF percent string: `100 / IMF` at two
 * decimals, in exact decimal arithmetic. Lighter leverage is fractional
 * (IMF 45% = 2.22x), and whole-number rounding understates the margin
 * requirement consumers derive from it. `undefined` for a non-positive or
 * unparsable IMF.
 * @public
 */
export const leverageFromImf = (imf: string): number | undefined => {
  let parsed: Big
  try {
    parsed = new Big(imf)
  } catch {
    return undefined
  }
  if (parsed.lte(0)) {
    return undefined
  }
  return new Big(100).div(parsed).round(2, Big.roundHalfUp).toNumber()
}

/**
 * Map a raw Lighter account position to the generic Position type.
 * @param market - Backend-resolved market identity for `pos.market_id`.
 * @public
 */
export const mapPosition = (
  pos: LtAccountPosition,
  market: MarketDisplay
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
    market,
    side: pos.sign >= 0 ? PositionSide.LONG : PositionSide.SHORT,
    size: Math.abs(size).toString(),
    entryPrice: pos.avg_entry_price,
    markPrice:
      pos.position_value === '0' || size === 0
        ? '0'
        : (parseFloat(pos.position_value) / Math.abs(size)).toString(),
    liquidationPrice: pos.liquidation_price,
    unrealizedPnl: pos.unrealized_pnl,
    leverage: leverageFromImf(pos.initial_margin_fraction) ?? 1,
    marginUsed,
    marginMode: isIsolated ? MarginMode.ISOLATED : MarginMode.CROSS,
  }
}
