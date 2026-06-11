import type { Position } from '@lifi/perps-types'
import type { LtAccountPosition } from '../types/index.js'
import { mapPosition } from './mapPosition.js'
import type { LighterMarketMeta } from './marketDisplay.js'

/**
 * Map one raw Lighter account position to a {@link Position}, resolving the
 * display symbol as backend lookup → wire `symbol` → synthetic `market_<id>`
 * placeholder.
 *
 * @public
 */
export const mapAccountPosition = (
  p: LtAccountPosition,
  symbolLookup: ReadonlyMap<number, LighterMarketMeta>
): Position =>
  mapPosition(
    p,
    symbolLookup.get(p.market_id)?.displaySymbol ??
      p.symbol ??
      `market_${p.market_id}`
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
  symbolLookup: ReadonlyMap<number, LighterMarketMeta>
): Position[] =>
  positions
    .filter((p) => Number.parseFloat(p.position) !== 0)
    .map((p) => mapAccountPosition(p, symbolLookup))
