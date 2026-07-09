import type { MarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import Big from 'big.js'
import type { OndoPosition } from '../types/wire.js'

/**
 * Map a raw Ondo position to the generic Position type. Ondo margin accounts
 * are cross-margined only.
 *
 * @param market - Backend-resolved market identity for `pos.market`.
 * @public
 */
export const mapPosition = (
  pos: OndoPosition,
  market: MarketDisplay
): Position => ({
  market,
  side: pos.direction === 'short' ? PositionSide.SHORT : PositionSide.LONG,
  size: new Big(pos.netQuantity).abs().toFixed(),
  entryPrice: pos.averageEntryPrice,
  markPrice: pos.markPrice,
  liquidationPrice: pos.liquidationPrice,
  unrealizedPnl: pos.unrealizedPnl,
  leverage: Number.parseFloat(pos.leverage),
  marginUsed: pos.usedMargin,
  marginMode: MarginMode.CROSS,
})

/**
 * Map raw Ondo positions to open {@link Position}s, dropping neutral and
 * zero-quantity rows. Only valid for payloads carrying the full position
 * set — dropping zeros from a partial frame would make closes unobservable.
 *
 * @public
 */
export const mapOpenPositions = (
  positions: OndoPosition[],
  resolveMarket: (market: string) => MarketDisplay
): Position[] =>
  positions
    .filter(
      (p) => p.direction !== 'neutral' && Number.parseFloat(p.netQuantity) !== 0
    )
    .map((p) => mapPosition(p, resolveMarket(p.market)))
