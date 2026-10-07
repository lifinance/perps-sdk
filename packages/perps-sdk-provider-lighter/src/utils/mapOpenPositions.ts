import { isDecimalStringZero } from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import type { LtAccountPosition } from '../types/index.js'
import { mapPosition } from './mapPosition.js'

/**
 * True when the Lighter position row has a non-zero size. A malformed size
 * keeps the row.
 * @public
 */
export const isOpenPosition = (p: LtAccountPosition): boolean =>
  !isDecimalStringZero(p.position)

/**
 * Map raw Lighter account positions to open {@link Position}s, dropping
 * zero-size rows. Only valid for payloads carrying the full position set —
 * dropping zeros from a partial frame would make closes unobservable.
 *
 * @public
 */
export const mapOpenPositions = (
  positions: LtAccountPosition[],
  resolveMarket: (marketId: number) => PerpsMarketDisplay
): Position[] =>
  positions
    .filter(isOpenPosition)
    .map((p) => mapPosition(p, resolveMarket(p.market_id)))
