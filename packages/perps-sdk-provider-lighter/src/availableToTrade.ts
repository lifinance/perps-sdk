import {
  addDecimalString,
  isDecimalStringGreaterThan,
  toAssetDisplay,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import type { AvailableToTrade, Market, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY } from './constants.js'

export const atLeastZero = (value: string): string =>
  isDecimalStringGreaterThan('0', value) ? '0' : value

// `availableMargin` is the cross free collateral and holds nothing of an
// isolated position, so closing one releases its whole equity.
const releasedOnClose = (position: Position): string => {
  const marginUsed = unknownToDecimalString(
    position.marginUsed,
    'marginUsed',
    LIGHTER_PROVIDER_KEY
  )
  if (position.marginMode !== MarginMode.ISOLATED) {
    return marginUsed
  }
  return atLeastZero(
    addDecimalString(
      marginUsed,
      unknownToDecimalString(
        position.unrealizedPnl,
        'unrealizedPnl',
        LIGHTER_PROVIDER_KEY
      )
    )
  )
}

/**
 * The amounts the account can still buy and sell on one Lighter perps
 * market. The side that adds to an open position on `market` gets
 * `availableMargin`. The side that reduces or flips it gets the position's
 * initial margin requirement, which the closing part of the order consumes,
 * plus `availableMargin` and the margin that closing releases, floored at 0.
 * A deficit therefore never cuts the closing part. Both amounts are at least 0.
 *
 * @param availableMargin - Signed cross free collateral, before summary clamping.
 * @throws {PerpsError} `SDKError` when a decimal the formula reads is malformed.
 * @internal
 */
export const lighterAvailableToTrade = (
  market: Market,
  availableMargin: string,
  positions: readonly Position[]
): AvailableToTrade => {
  const available = unknownToDecimalString(
    availableMargin,
    'availableMargin',
    LIGHTER_PROVIDER_KEY
  )
  const adding = atLeastZero(available)
  const position = positions.find((p) => p.market.id === market.id)
  const reducing =
    position === undefined
      ? adding
      : addDecimalString(
          unknownToDecimalString(
            position.initialMarginRequirement,
            'initialMarginRequirement',
            LIGHTER_PROVIDER_KEY
          ),
          atLeastZero(addDecimalString(available, releasedOnClose(position)))
        )
  const isShort = position?.side === PositionSide.SHORT
  return {
    providerId: market.providerId,
    marketId: market.id,
    asset: toAssetDisplay(market.quoteAsset),
    buy: isShort ? reducing : adding,
    sell: isShort ? adding : reducing,
  }
}
