import {
  absDecimalString,
  safeIsDecimalStringZero,
  unknownToDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoPosition } from '../types/wire.js'

/**
 * Map a raw Ondo position to the generic Position type. Ondo margin accounts
 * are cross-margined only. A row with an invalid quantity gives `undefined`;
 * every other figure is the raw venue string.
 *
 * @param market - Backend-resolved market identity for `pos.market`.
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
      pos.netQuantity
    )
    return undefined
  }
  return {
    market,
    side: pos.direction === 'short' ? PositionSide.SHORT : PositionSide.LONG,
    size,
    entryPrice: pos.averageEntryPrice,
    markPrice: pos.markPrice,
    liquidationPrice: pos.liquidationPrice,
    unrealizedPnl: pos.unrealizedPnl,
    accruedFunding: pos.netFundingSinceNeutral,
    leverage: pos.leverage,
    marginUsed: pos.usedMargin,
    initialMarginRequirement: pos.usedMargin,
    marginMode: MarginMode.CROSS,
  }
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
