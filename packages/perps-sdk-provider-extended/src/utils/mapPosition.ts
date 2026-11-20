import {
  buildPosition,
  calculateInitialMarginRoe,
  isDecimalString,
  isDecimalStringGreaterThan,
  remarkPositionValues,
  unknownToDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { EXTENDED_PROVIDER_KEY } from '../constants.js'
import type { ExtendedPosition } from '../types/wire.js'

/** ROE percentage from entry notional and the venue leverage. @public */
export const calculateRoe = (position: Position): string | undefined => {
  const { unrealizedPnl, size, entryPrice, leverage } = position
  if (
    !isDecimalString(unrealizedPnl) ||
    !isDecimalStringGreaterThan(size, '0') ||
    !isDecimalStringGreaterThan(entryPrice, '0') ||
    leverage === undefined ||
    !isDecimalString(leverage) ||
    !isDecimalStringGreaterThan(leverage, '0')
  ) {
    return undefined
  }
  return calculateInitialMarginRoe(unrealizedPnl, size, entryPrice, leverage)
}

/** Recalculate mark fields and ROE without changing the snapshot margin. @public */
export const remarkPosition = (
  position: Position,
  markPrice: string
): Position => {
  const remarked = remarkPositionValues(position, markPrice)
  if (remarked === position) {
    return position
  }
  const roe = calculateRoe(remarked)
  if (roe !== undefined) {
    remarked.returnOnEquity = roe
  }
  return remarked
}

/**
 * Map an Extended position. Extended margins the whole account together, so
 * every position is `CROSS`. A row with an invalid size gives `undefined`.
 *
 * @public
 */
export const mapPosition = (
  position: ExtendedPosition,
  market: PerpsMarketDisplay
): Position | undefined => {
  let size: string
  try {
    size = unknownToDecimalString(position.size, 'size', EXTENDED_PROVIDER_KEY)
  } catch {
    warnSkippedVenueRow(
      EXTENDED_PROVIDER_KEY,
      'position',
      'size',
      position.size,
      { marketId: market.id }
    )
    return undefined
  }
  const mapped = buildPosition({
    market,
    side: position.side === 'SHORT' ? PositionSide.SHORT : PositionSide.LONG,
    size,
    entryPrice: position.openPrice,
    markPrice: position.markPrice,
    positionValue: position.value,
    // An absent or zero liquidation price means the venue gives none.
    ...(isDecimalStringGreaterThan(position.liquidationPrice ?? '0', '0')
      ? { liquidationPrice: position.liquidationPrice }
      : {}),
    unrealizedPnl: position.unrealisedPnl,
    leverage: position.leverage,
    marginUsed: position.margin,
    marginMode: MarginMode.CROSS,
  })
  const roe = calculateRoe(mapped)
  return roe === undefined ? mapped : { ...mapped, returnOnEquity: roe }
}
