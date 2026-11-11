import {
  absDecimalString,
  buildPosition,
  isDecimalString,
  multiplyDecimalString,
  safeIsDecimalStringZero,
  unknownToDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoPosition } from '../types/wire.js'

/** Map an Ondo cross position, omitting a row with invalid quantity.
 * Interpret venue ROE as a fraction and return a percent.
 * @public
 */
export const mapPosition = (
  pos: OndoPosition,
  market: PerpsMarketDisplay
): Position | undefined => {
  let size: string
  try {
    size = absDecimalString(
      unknownToDecimalString(pos.netQuantity, 'netQuantity', ONDO_PROVIDER_KEY)
    )
  } catch {
    warnSkippedVenueRow(
      ONDO_PROVIDER_KEY,
      'position',
      'netQuantity',
      pos.netQuantity,
      { marketId: market.id }
    )
    return undefined
  }
  const positionValue = isDecimalString(pos.notionalValue)
    ? absDecimalString(pos.notionalValue)
    : undefined
  return buildPosition({
    market,
    side: pos.direction === 'short' ? PositionSide.SHORT : PositionSide.LONG,
    size,
    entryPrice: pos.averageEntryPrice,
    markPrice: pos.markPrice,
    ...(positionValue === undefined ? {} : { positionValue }),
    liquidationPrice: pos.liquidationPrice,
    unrealizedPnl: pos.unrealizedPnl,
    ...(isDecimalString(pos.returnOnEquity)
      ? { returnOnEquity: multiplyDecimalString(pos.returnOnEquity, '100') }
      : {}),
    accruedFunding: pos.netFundingSinceNeutral,
    leverage: pos.leverage,
    marginUsed: pos.usedMargin,
    initialMarginRequirement: pos.usedMargin,
    marginMode: MarginMode.CROSS,
  })
}

/**
 * True when the Ondo position row is not neutral and has a non-zero quantity.
 * A malformed quantity keeps the row.
 * @public
 */
export const isOpenPosition = (p: OndoPosition): boolean =>
  p.direction !== 'neutral' && safeIsDecimalStringZero(p.netQuantity) !== true

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
