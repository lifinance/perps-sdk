import type {
  FundingActivity,
  LiquidationActivity,
  MarketDisplay,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type {
  OndoFundingFeeTransfer,
  OndoLiquidationEvent,
} from '../types/wire.js'

/**
 * Map an Ondo funding-fee transfer to a {@link FundingActivity}. Ondo carries
 * no transfer id on the wire, so a deterministic `funding:<market>:<ISO time>`
 * id is synthesized — funding settles at most once per market per interval,
 * so the pair is unique.
 *
 * @param market - Backend-resolved market identity for `transfer.market`.
 * @public
 */
export const mapFundingActivity = (
  transfer: OndoFundingFeeTransfer,
  market: MarketDisplay
): FundingActivity => {
  const timestamp = new Date(transfer.time).toISOString()
  return {
    id: `funding:${transfer.market}:${timestamp}`,
    provider: ONDO_PROVIDER_KEY,
    timestamp,
    type: ActivityType.FUNDING,
    market,
    amount: transfer.amount,
    positionSize: transfer.positionSize,
    fundingRate: transfer.rate,
  }
}

/**
 * Map an Ondo liquidation event to a {@link LiquidationActivity}, or `null`
 * when the event names no triggering position. Ondo margin accounts are
 * cross-only, so `leverageType` is always `'cross'`. Ondo reports no account
 * value at liquidation time, so `accountValue` stays absent. One Ondo event
 * carries the whole cross-margin cascade in `triggeringPositions`, so every
 * liquidated market and size reaches `liquidatedPositions`.
 *
 * @public
 */
export const mapLiquidationActivity = (
  event: OndoLiquidationEvent,
  resolveMarket: (market: string) => MarketDisplay
): LiquidationActivity | null => {
  const liquidatedPositions = (event.triggeringPositions ?? []).map((p) => ({
    market: resolveMarket(p.market),
    size: p.netQuantity,
  }))
  if (liquidatedPositions.length === 0) {
    return null
  }
  return {
    id: event.id,
    provider: ONDO_PROVIDER_KEY,
    timestamp: new Date(event.time).toISOString(),
    type: ActivityType.LIQUIDATION,
    ...(event.filledQuoteSize === undefined
      ? {}
      : { liquidatedNotionalPosition: event.filledQuoteSize }),
    leverageType: 'cross',
    liquidatedPositions,
  }
}
