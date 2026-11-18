import {
  absDecimalString,
  buildPosition,
  calculateRoe as calculateMarginRoe,
  calculateNotionalValue,
  createWarnOnce,
  divideDecimalString,
  isDecimalString,
  isDecimalStringEqual,
  isDecimalStringGreaterThan,
  isDecimalStringZero,
  multiplyDecimalString,
  remarkPositionValues,
  roundDecimalString,
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
  LIGHTER_LEVERAGE_DISPLAY_PRECISION,
  LIGHTER_LEVERAGE_PRECISION,
  LIGHTER_PROVIDER_KEY,
} from '../constants.js'
import type { LtAccountPosition } from '../types/index.js'
import { LT_MARGIN_MODE_ISOLATED } from '../types/index.js'

/**
 * Display leverage from an IMF percent string: `100 / IMF` in exact decimal
 * arithmetic, rounded half-up to the given precision (two decimals by default).
 * The stored IMF can make this differ from the requested leverage.
 * Returns `undefined` for a non-positive
 * or unparsable IMF.
 * @public
 */
export const leverageFromImf = (
  imf: string,
  precision = LIGHTER_LEVERAGE_PRECISION
): string | undefined => {
  if (safeIsDecimalStringGreaterThan(imf, '0') !== true) {
    return undefined
  }
  const leverage = safeDivideDecimalString('100', imf)
  return leverage === undefined
    ? undefined
    : safeRoundDecimalString(leverage, precision, 'round')
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

/** ROE percentage from entry notional and the exact basis-point initial margin fraction. */
export const calculateRoe = (position: Position): string | undefined => {
  const { unrealizedPnl, size, entryPrice, initialMarginFractionBps } = position
  if (
    !isDecimalString(unrealizedPnl) ||
    !isDecimalString(size) ||
    !isDecimalStringGreaterThan(size, '0') ||
    !isDecimalString(entryPrice) ||
    !isDecimalStringGreaterThan(entryPrice, '0') ||
    !isDecimalString(initialMarginFractionBps) ||
    !isDecimalStringGreaterThan(initialMarginFractionBps, '0') ||
    !isDecimalStringEqual(
      initialMarginFractionBps,
      roundDecimalString(initialMarginFractionBps, 0, 'truncate')
    )
  ) {
    return undefined
  }
  const margin = divideDecimalString(
    multiplyDecimalString(
      calculateNotionalValue(size, entryPrice),
      initialMarginFractionBps
    ),
    '10000'
  )
  return calculateMarginRoe(unrealizedPnl, margin)
}

/** Recalculate mark fields and ROE from the retained IMF without changing the input or snapshot margin. */
export const remarkPosition = (
  position: Position,
  markPrice: string
): Position => {
  const remarked = remarkPositionValues(position, markPrice)
  if (remarked === position) {
    return position
  }
  const roe = calculateRoe(remarked)
  if (roe !== undefined) {
    remarked.returnOnEquity = roe
  }
  return remarked
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
 * warns once. Prices, PnL, funding and isolated margin pass through raw. A
 * zero or empty `liquidation_price`, which Lighter sends for a position that
 * no price liquidates, leaves `liquidationPrice` absent.
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
  const leverage = isDecimalString(imf)
    ? leverageFromImf(imf, LIGHTER_LEVERAGE_DISPLAY_PRECISION)
    : undefined
  if (leverage === undefined) {
    warnUnreadableField('initial_margin_fraction', imf)
  }
  const initialMarginRequirement =
    positionValue === undefined || leverage === undefined
      ? undefined
      : divideDecimalString(multiplyDecimalString(positionValue, imf), '100')
  const liquidationPrice = pos.liquidation_price
  const hasLiquidationPrice = isDecimalString(liquidationPrice)
    ? !isDecimalStringZero(liquidationPrice)
    : liquidationPrice !== ''

  const mapped = buildPosition({
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
          positionValue,
        }),
    ...(hasLiquidationPrice ? { liquidationPrice } : {}),
    unrealizedPnl: pos.unrealized_pnl,
    accruedFunding: pos.total_funding_paid_out ?? '0',
    ...(leverage === undefined
      ? {}
      : {
          leverage,
          initialMarginFractionBps: multiplyDecimalString(
            imf,
            String(LIGHTER_IMF_PERCENT_SCALE)
          ),
        }),
    marginUsed: isIsolated
      ? pos.allocated_margin
      : (initialMarginRequirement ?? '0'),
    ...(initialMarginRequirement === undefined
      ? {}
      : { initialMarginRequirement }),
    marginMode: isIsolated ? MarginMode.ISOLATED : MarginMode.CROSS,
  })
  const roe = calculateRoe(mapped)
  if (roe !== undefined) {
    mapped.returnOnEquity = roe
  }
  return mapped
}
