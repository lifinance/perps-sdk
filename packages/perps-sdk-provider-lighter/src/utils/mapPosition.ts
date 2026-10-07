import {
  absDecimalString,
  createWarnOnce,
  divideDecimalString,
  isDecimalString,
  isDecimalStringZero,
  multiplyDecimalString,
  safeDivideDecimalString,
  safeIsDecimalStringGreaterThan,
  safeNumberToDecimalString,
  safeRoundDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import {
  LIGHTER_IMF_PERCENT_SCALE,
  LIGHTER_LEVERAGE_PRECISION,
  LIGHTER_PROVIDER_KEY,
} from '../constants.js'
import type { LtAccountPosition } from '../types/index.js'
import { LT_MARGIN_MODE_ISOLATED } from '../types/index.js'

/**
 * Display leverage from an IMF percent string: `100 / IMF` in exact decimal
 * arithmetic, rounded half-up to `LIGHTER_LEVERAGE_PRECISION`, so the value a
 * client reads is the value it saved. Provider risk calculations consume the
 * original decimal IMF instead. `undefined` for a non-positive or unparsable
 * IMF.
 * @public
 */
export const leverageFromImf = (imf: string): string | undefined => {
  if (safeIsDecimalStringGreaterThan(imf, '0') !== true) {
    return undefined
  }
  const leverage = safeDivideDecimalString('100', imf)
  return leverage === undefined
    ? undefined
    : safeRoundDecimalString(leverage, LIGHTER_LEVERAGE_PRECISION, 'round')
}

/**
 * Display leverage from an integer IMF on `LIGHTER_IMF_PERCENT_SCALE`, the
 * unit of trade rows and order-book details: `500` is 5.00%, so 20x.
 * `undefined` for a non-positive or non-finite IMF. Lighter declares the
 * fraction a `StrictInt`, so the scale division is exact.
 */
export const leverageFromScaledImf = (imf: number): string | undefined => {
  const scaled = safeNumberToDecimalString(imf)
  const percent =
    scaled === undefined
      ? undefined
      : safeDivideDecimalString(scaled, String(LIGHTER_IMF_PERCENT_SCALE))
  return percent === undefined ? undefined : leverageFromImf(percent)
}

const skipPosition = (
  marketId: string,
  field: string,
  value: unknown
): undefined => {
  warnSkippedVenueRow(LIGHTER_PROVIDER_KEY, 'position', field, value, {
    marketId,
  })
  return undefined
}

const warnUnreadableFieldOnce = createWarnOnce()

const warnUnreadableField = (field: string, value: unknown): void => {
  warnUnreadableFieldOnce(
    `${LIGHTER_PROVIDER_KEY}|position.${field}`,
    `[${LIGHTER_PROVIDER_KEY}] position \`${field}\` is not readable, so the derived fields are absent: '${String(value).slice(0, 64)}'`
  )
}

/**
 * Map a raw Lighter account position to the generic Position type. A row with
 * an invalid size gives `undefined`. An invalid position value or a
 * non-positive initial margin fraction keeps the row, leaves `leverage` and
 * `initialMarginRequirement` absent, sets a cross `marginUsed` to `'0'` and
 * warns once. Prices, PnL, funding and isolated margin pass through raw.
 * @param market - Backend-resolved market identity for `pos.market_id`.
 * @public
 */
export const mapPosition = (
  pos: LtAccountPosition,
  market: PerpsMarketDisplay
): Position | undefined => {
  if (!isDecimalString(pos.position)) {
    return skipPosition(market.id, 'position', pos.position)
  }
  const isIsolated = pos.margin_mode === LT_MARGIN_MODE_ISOLATED
  const size = absDecimalString(pos.position)
  const positionValue = isDecimalString(pos.position_value)
    ? absDecimalString(pos.position_value)
    : undefined
  if (positionValue === undefined) {
    warnUnreadableField('position_value', pos.position_value)
  }
  const imf = pos.initial_margin_fraction
  const leverage = isDecimalString(imf) ? leverageFromImf(imf) : undefined
  if (leverage === undefined) {
    warnUnreadableField('initial_margin_fraction', imf)
  }
  const initialMarginRequirement =
    positionValue === undefined || leverage === undefined
      ? undefined
      : divideDecimalString(multiplyDecimalString(positionValue, imf), '100')

  return {
    market,
    side: pos.sign >= 0 ? PositionSide.LONG : PositionSide.SHORT,
    size,
    entryPrice: pos.avg_entry_price,
    ...(positionValue === undefined
      ? {}
      : {
          markPrice:
            isDecimalStringZero(positionValue) || isDecimalStringZero(size)
              ? '0'
              : divideDecimalString(positionValue, size),
        }),
    liquidationPrice: pos.liquidation_price,
    unrealizedPnl: pos.unrealized_pnl,
    accruedFunding: pos.total_funding_paid_out ?? '0',
    ...(leverage === undefined ? {} : { leverage }),
    marginUsed: isIsolated
      ? pos.allocated_margin
      : (initialMarginRequirement ?? '0'),
    ...(initialMarginRequirement === undefined
      ? {}
      : { initialMarginRequirement }),
    marginMode: isIsolated ? MarginMode.ISOLATED : MarginMode.CROSS,
  }
}
