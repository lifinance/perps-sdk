import type { Position } from '@lifi/perps-types'
import type { LtAccountPosition } from '../types/index.js'
import { mapPosition } from './mapPosition.js'

/**
 * Map raw Lighter account positions to open {@link Position}s: zero-size rows
 * are dropped, and each display symbol resolves as backend lookup → wire
 * `symbol` → synthetic `market_<id>` placeholder. Shared by the REST reads
 * and the WS positions stream so both apply the same rules.
 *
 * @public
 */
export const mapOpenPositions = (
  positions: LtAccountPosition[],
  symbolLookup: ReadonlyMap<number, string>
): Position[] =>
  positions
    .filter((p) => Number.parseFloat(p.position) !== 0)
    .map((p) =>
      mapPosition(
        p,
        symbolLookup.get(p.market_id) ?? p.symbol ?? `market_${p.market_id}`
      )
    )
