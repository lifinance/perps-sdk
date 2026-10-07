import {
  asDecimalString,
  decimalStringToNumber,
  isDecimalStringZero,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import Big from 'big.js'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoPosition } from '../types/wire.js'

const REQUIRED_DECIMAL_FIELDS = [
  'averageEntryPrice',
  'markPrice',
  'liquidationPrice',
  'unrealizedPnl',
  'netFundingSinceNeutral',
  'usedMargin',
] as const

const invalidField = (pos: OndoPosition): [string, unknown] => {
  const field =
    REQUIRED_DECIMAL_FIELDS.find(
      (name) => asDecimalString(pos[name]) === undefined
    ) ?? REQUIRED_DECIMAL_FIELDS[0]
  return [field, pos[field]]
}

/**
 * Map a raw Ondo position to the generic Position type. Ondo margin accounts
 * are cross-margined only. A row with an invalid quantity, leverage, price,
 * PnL, funding or margin gives `undefined`.
 *
 * @param market - Backend-resolved market identity for `pos.market`.
 * @public
 */
export const mapPosition = (
  pos: OndoPosition,
  market: PerpsMarketDisplay
): Position | undefined => {
  const netQuantity = asDecimalString(pos.netQuantity)
  if (netQuantity === undefined) {
    warnSkippedVenueRow(
      ONDO_PROVIDER_KEY,
      'position',
      'netQuantity',
      pos.netQuantity
    )
    return undefined
  }
  const leverage = decimalStringToNumber(asDecimalString(pos.leverage))
  if (leverage === undefined) {
    warnSkippedVenueRow(ONDO_PROVIDER_KEY, 'position', 'leverage', pos.leverage)
    return undefined
  }
  const entryPrice = asDecimalString(pos.averageEntryPrice)
  const markPrice = asDecimalString(pos.markPrice)
  const liquidationPrice = asDecimalString(pos.liquidationPrice)
  const unrealizedPnl = asDecimalString(pos.unrealizedPnl)
  const accruedFunding = asDecimalString(pos.netFundingSinceNeutral)
  const usedMargin = asDecimalString(pos.usedMargin)
  if (
    entryPrice === undefined ||
    markPrice === undefined ||
    liquidationPrice === undefined ||
    unrealizedPnl === undefined ||
    accruedFunding === undefined ||
    usedMargin === undefined
  ) {
    const [field, value] = invalidField(pos)
    warnSkippedVenueRow(ONDO_PROVIDER_KEY, 'position', field, value)
    return undefined
  }
  return {
    market,
    side: pos.direction === 'short' ? PositionSide.SHORT : PositionSide.LONG,
    size: new Big(netQuantity).abs().toFixed(),
    entryPrice,
    markPrice,
    liquidationPrice,
    unrealizedPnl,
    accruedFunding,
    leverage,
    marginUsed: usedMargin,
    initialMarginRequirement: usedMargin,
    marginMode: MarginMode.CROSS,
  }
}

/**
 * True when the Ondo position row is not neutral and has a non-zero quantity.
 * A malformed quantity keeps the row.
 * @public
 */
export const isOpenPosition = (p: OndoPosition): boolean =>
  p.direction !== 'neutral' && !isDecimalStringZero(p.netQuantity)

/**
 * Map raw Ondo positions to open {@link Position}s, dropping neutral and
 * zero-quantity rows and rows that `mapPosition` skips. Only valid for
 * payloads carrying the full position set — dropping zeros from a partial
 * frame would make closes unobservable.
 *
 * @public
 */
export const mapOpenPositions = (
  positions: OndoPosition[],
  resolveMarket: (market: string) => PerpsMarketDisplay
): Position[] =>
  positions.filter(isOpenPosition).flatMap((p) => {
    const position = mapPosition(p, resolveMarket(p.market))
    return position === undefined ? [] : [position]
  })
