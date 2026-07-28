import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import Big from 'big.js'
import type { LtAccountPosition } from '../types/index.js'
import { LT_MARGIN_MODE_ISOLATED } from '../types/index.js'
import { toPositiveRequiredBig, toRequiredBig } from './decimal.js'

/**
 * Display leverage from an IMF percent string: `100 / IMF` in exact decimal
 * arithmetic before conversion to `number`. This value is for displaying the
 * venue setting; provider risk calculations consume the original decimal IMF
 * instead. `undefined` for a non-positive or unparsable IMF.
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
  return new Big(100).div(parsed).toNumber()
}

/**
 * Map a raw Lighter account position to the generic Position type.
 * @param market - Backend-resolved market identity for `pos.market_id`.
 * @public
 */
export const mapPosition = (
  pos: LtAccountPosition,
  market: PerpsMarketDisplay
): Position => {
  const size = toRequiredBig(pos.position, 'position')
  const isIsolated = pos.margin_mode === LT_MARGIN_MODE_ISOLATED
  const positionValue = toRequiredBig(
    pos.position_value,
    'position_value'
  ).abs()
  const imf = toPositiveRequiredBig(
    pos.initial_margin_fraction,
    'initial_margin_fraction'
  )
  const initialMarginRequirement = positionValue.times(imf).div(100)
  const marginUsed = isIsolated
    ? pos.allocated_margin
    : initialMarginRequirement.toFixed()

  return {
    market,
    side: pos.sign >= 0 ? PositionSide.LONG : PositionSide.SHORT,
    size: size.abs().toFixed(),
    entryPrice: pos.avg_entry_price,
    markPrice:
      positionValue.eq(0) || size.eq(0)
        ? '0'
        : positionValue.div(size.abs()).toFixed(),
    liquidationPrice: pos.liquidation_price,
    unrealizedPnl: pos.unrealized_pnl,
    leverage: leverageFromImf(pos.initial_margin_fraction) ?? 1,
    marginUsed,
    initialMarginRequirement: initialMarginRequirement.toFixed(),
    marginMode: isIsolated ? MarginMode.ISOLATED : MarginMode.CROSS,
  }
}
