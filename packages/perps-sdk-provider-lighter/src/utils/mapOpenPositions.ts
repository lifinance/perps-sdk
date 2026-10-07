import { isDecimalStringZero, PerpsError } from '@lifi/perps-sdk'
import {
  PerpsErrorCode,
  type PerpsMarketDisplay,
  type Position,
} from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'
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
 * zero-size rows and rows that `mapPosition` skips. Only valid for payloads
 * carrying the full position set — dropping zeros from a partial frame would
 * make closes unobservable.
 *
 * @public
 */
export const mapOpenPositions = (
  positions: LtAccountPosition[],
  resolveMarket: (marketId: number) => PerpsMarketDisplay
): Position[] =>
  positions.filter(isOpenPosition).flatMap((p) => {
    const position = mapPosition(p, resolveMarket(p.market_id))
    return position === undefined ? [] : [position]
  })

/**
 * Map every open Lighter position for account totals, which must not leave a
 * position out.
 *
 * @throws {PerpsError} `SDKError` when `mapPosition` skips an open row.
 */
export const requireOpenPositions = (
  positions: LtAccountPosition[],
  resolveMarket: (marketId: number) => PerpsMarketDisplay
): Position[] =>
  positions.filter(isOpenPosition).map((p) => {
    const position = mapPosition(p, resolveMarket(p.market_id))
    if (position !== undefined) {
      return position
    }
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      `${LIGHTER_PROVIDER_KEY} position for market ${p.market_id} is not valid, so the account totals are unknown.`
    )
    error.tool = LIGHTER_PROVIDER_KEY
    throw error
  })
