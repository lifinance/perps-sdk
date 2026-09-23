import { toAssetDisplay } from '@lifi/perps-sdk'
import type { AvailableToTrade, Market, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import Big from 'big.js'
import { toRequiredBig } from './utils/decimal.js'

const atLeastZero = (value: Big): Big => (value.lt(0) ? new Big(0) : value)

// Lighter's `available_balance` already nets cross unrealized PnL and counts
// an isolated position's equity above its IMR, so only the rest is released.
const releasedOnClose = (position: Position): Big => {
  const marginUsed = toRequiredBig(position.marginUsed, 'marginUsed')
  if (position.marginMode !== MarginMode.ISOLATED) {
    return marginUsed
  }
  const equity = marginUsed.plus(
    toRequiredBig(position.unrealizedPnl, 'unrealizedPnl')
  )
  const imr = toRequiredBig(
    position.initialMarginRequirement,
    'initialMarginRequirement'
  )
  return equity.lt(imr) ? equity : imr
}

/**
 * The amounts the account can still buy and sell on one Lighter perps
 * market. The side that adds to an open position on `market` gets
 * `availableMargin`. The side that reduces or flips it gets the position's
 * initial margin requirement, which the closing part of the order consumes,
 * plus `availableMargin` and the margin that closing releases, floored at 0.
 * A deficit therefore never cuts the closing part. Both amounts are at least 0.
 *
 * @param availableMargin - The account's {@link AccountSummary.availableMargin}.
 * @throws {PerpsError} `SDKError` when a decimal the formula reads is malformed.
 * @internal
 */
export const lighterAvailableToTrade = (
  market: Market,
  availableMargin: string,
  positions: readonly Position[]
): AvailableToTrade => {
  const available = toRequiredBig(availableMargin, 'availableMargin')
  const adding = atLeastZero(available)
  const position = positions.find((p) => p.market.id === market.id)
  const reducing =
    position === undefined
      ? adding
      : toRequiredBig(
          position.initialMarginRequirement,
          'initialMarginRequirement'
        ).plus(atLeastZero(available.plus(releasedOnClose(position))))
  const isShort = position?.side === PositionSide.SHORT
  return {
    providerId: market.providerId,
    marketId: market.id,
    asset: toAssetDisplay(market.quoteAsset),
    buy: (isShort ? reducing : adding).toFixed(),
    sell: (isShort ? adding : reducing).toFixed(),
  }
}
