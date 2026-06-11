import type { MarketDisplay, Position } from '@lifi/perps-types'
import type { LtAccountPosition } from '../types/index.js'
import { mapPosition } from './mapPosition.js'
import { resolveMarketDisplay } from './marketDisplay.js'

/**
 * Map one raw Lighter account position to a {@link Position}, resolving the
 * market as backend lookup → wire `symbol` → synthetic `market_<id>`
 * placeholder.
 *
 * @public
 */
export const mapAccountPosition = (
  p: LtAccountPosition,
  byMarketId: ReadonlyMap<number, MarketDisplay>
): Position =>
  mapPosition(
    p,
    resolveMarketDisplay(
      byMarketId,
      p.market_id,
      p.symbol ?? `market_${p.market_id}`
    )
  )

/**
 * Map raw Lighter account positions to open {@link Position}s, dropping
 * zero-size rows. Only valid for payloads carrying the full position set —
 * dropping zeros from a partial frame would make closes unobservable.
 *
 * @public
 */
export const mapOpenPositions = (
  positions: LtAccountPosition[],
  byMarketId: ReadonlyMap<number, MarketDisplay>
): Position[] =>
  positions
    .filter((p) => Number.parseFloat(p.position) !== 0)
    .map((p) => mapAccountPosition(p, byMarketId))
