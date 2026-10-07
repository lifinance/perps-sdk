import { asDecimalString, warnSkippedVenueRow } from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import Big from 'big.js'
import {
  LIGHTER_IMF_PERCENT_SCALE,
  LIGHTER_LEVERAGE_PRECISION,
  LIGHTER_PROVIDER_KEY,
} from '../constants.js'
import type { LtAccountPosition } from '../types/index.js'
import { LT_MARGIN_MODE_ISOLATED } from '../types/index.js'

/**
 * Display leverage from an IMF percent string: `100 / IMF` in exact decimal
 * arithmetic, rounded half-up to `LIGHTER_LEVERAGE_PRECISION` before
 * conversion to `number`, so the value a client reads is the value it saved.
 * Provider risk calculations consume the original decimal IMF instead.
 * `undefined` for a non-positive or unparsable IMF.
 * @public
 */
export const leverageFromImf = (imf: string): number | undefined => {
  const decimal = asDecimalString(imf)
  if (decimal === undefined || new Big(decimal).lte(0)) {
    return undefined
  }
  return new Big(100)
    .div(decimal)
    .round(LIGHTER_LEVERAGE_PRECISION, Big.roundHalfUp)
    .toNumber()
}

/**
 * Display leverage from an integer IMF on `LIGHTER_IMF_PERCENT_SCALE`, the
 * unit of trade rows and order-book details: `500` is 5.00%, so 20x.
 * `undefined` for a non-positive or unparsable IMF. Lighter declares the
 * fraction a `StrictInt`, so the scale division is exact.
 */
export const leverageFromScaledImf = (imf: number): number | undefined => {
  const decimal = asDecimalString(imf)
  return decimal === undefined
    ? undefined
    : leverageFromImf(new Big(decimal).div(LIGHTER_IMF_PERCENT_SCALE).toFixed())
}

const skipPosition = (field: string, value: unknown): undefined => {
  warnSkippedVenueRow(LIGHTER_PROVIDER_KEY, 'position', field, value)
  return undefined
}

/**
 * Map a raw Lighter account position to the generic Position type. A row with
 * a non-positive initial margin fraction, or an invalid size, value, price,
 * PnL, funding or isolated margin, gives `undefined`.
 * @param market - Backend-resolved market identity for `pos.market_id`.
 * @public
 */
export const mapPosition = (
  pos: LtAccountPosition,
  market: PerpsMarketDisplay
): Position | undefined => {
  const sizeDecimal = asDecimalString(pos.position)
  if (sizeDecimal === undefined) {
    return skipPosition('position', pos.position)
  }
  const positionValueDecimal = asDecimalString(pos.position_value)
  if (positionValueDecimal === undefined) {
    return skipPosition('position_value', pos.position_value)
  }
  const imfDecimal = asDecimalString(pos.initial_margin_fraction)
  if (imfDecimal === undefined || new Big(imfDecimal).lte(0)) {
    return skipPosition('initial_margin_fraction', pos.initial_margin_fraction)
  }
  const entryPrice = asDecimalString(pos.avg_entry_price)
  if (entryPrice === undefined) {
    return skipPosition('avg_entry_price', pos.avg_entry_price)
  }
  const liquidationPrice = asDecimalString(pos.liquidation_price)
  if (liquidationPrice === undefined) {
    return skipPosition('liquidation_price', pos.liquidation_price)
  }
  const unrealizedPnl = asDecimalString(pos.unrealized_pnl)
  if (unrealizedPnl === undefined) {
    return skipPosition('unrealized_pnl', pos.unrealized_pnl)
  }
  const accruedFunding = asDecimalString(pos.total_funding_paid_out ?? '0')
  if (accruedFunding === undefined) {
    return skipPosition('total_funding_paid_out', pos.total_funding_paid_out)
  }
  const isIsolated = pos.margin_mode === LT_MARGIN_MODE_ISOLATED
  const allocatedMargin = isIsolated
    ? asDecimalString(pos.allocated_margin)
    : undefined
  if (isIsolated && allocatedMargin === undefined) {
    return skipPosition('allocated_margin', pos.allocated_margin)
  }
  const size = new Big(sizeDecimal)
  const positionValue = new Big(positionValueDecimal).abs()
  const initialMarginRequirement = positionValue.times(imfDecimal).div(100)

  return {
    market,
    side: pos.sign >= 0 ? PositionSide.LONG : PositionSide.SHORT,
    size: size.abs().toFixed(),
    entryPrice,
    markPrice:
      positionValue.eq(0) || size.eq(0)
        ? '0'
        : positionValue.div(size.abs()).toFixed(),
    liquidationPrice,
    unrealizedPnl,
    accruedFunding,
    leverage: leverageFromImf(imfDecimal) ?? 1,
    marginUsed: allocatedMargin ?? initialMarginRequirement.toFixed(),
    initialMarginRequirement: initialMarginRequirement.toFixed(),
    marginMode: isIsolated ? MarginMode.ISOLATED : MarginMode.CROSS,
  }
}
