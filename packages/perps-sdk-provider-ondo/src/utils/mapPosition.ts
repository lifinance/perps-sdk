import { isDecimalStringZero } from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import type { OndoPosition } from '../types/wire.js'
import { toWireBig } from './decimal.js'

/**
 * Map a raw Ondo position to the generic Position type. Ondo margin accounts
 * are cross-margined only.
 *
 * @param market - Backend-resolved market identity for `pos.market`.
 * @public
 */
export const mapPosition = (
  pos: OndoPosition,
  market: PerpsMarketDisplay
): Position => ({
  market,
  side: pos.direction === 'short' ? PositionSide.SHORT : PositionSide.LONG,
  size: toWireBig(pos.netQuantity, 'netQuantity').abs().toFixed(),
  entryPrice: pos.averageEntryPrice,
  markPrice: pos.markPrice,
  liquidationPrice: pos.liquidationPrice,
  unrealizedPnl: pos.unrealizedPnl,
  accruedFunding: pos.netFundingSinceNeutral,
  leverage: Number.parseFloat(pos.leverage),
  marginUsed: pos.usedMargin,
  initialMarginRequirement: pos.usedMargin,
  marginMode: MarginMode.CROSS,
})

/**
 * True when the Ondo position row is not neutral and has a non-zero quantity.
 * A malformed quantity keeps the row.
 * @public
 */
export const isOpenPosition = (p: OndoPosition): boolean =>
  p.direction !== 'neutral' && !isDecimalStringZero(p.netQuantity)

/**
 * Map raw Ondo positions to open {@link Position}s, dropping neutral and
 * zero-quantity rows. Only valid for payloads carrying the full position
 * set — dropping zeros from a partial frame would make closes unobservable.
 *
 * @public
 */
export const mapOpenPositions = (
  positions: OndoPosition[],
  resolveMarket: (market: string) => PerpsMarketDisplay
): Position[] =>
  positions
    .filter(isOpenPosition)
    .map((p) => mapPosition(p, resolveMarket(p.market)))
