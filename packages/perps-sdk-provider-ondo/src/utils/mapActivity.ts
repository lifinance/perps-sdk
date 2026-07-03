import type {
  FundingActivity,
  LiquidationActivity,
  MarketDisplay,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OnFundingFeeTransfer, OnLiquidationEvent } from '../types/wire.js'

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
  transfer: OnFundingFeeTransfer,
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
 * Map an Ondo liquidation event to a {@link LiquidationActivity}. Ondo does
 * not report the account value at liquidation time, and its margin accounts
 * are cross-only, so `accountValue` is `'0'` and `leverageType` is `'cross'`.
 *
 * @public
 */
export const mapLiquidationActivity = (
  event: OnLiquidationEvent,
  resolveMarket: (market: string) => MarketDisplay
): LiquidationActivity => ({
  id: event.id,
  provider: ONDO_PROVIDER_KEY,
  timestamp: new Date(event.time).toISOString(),
  type: ActivityType.LIQUIDATION,
  liquidatedNotionalPosition: event.filledQuoteSize ?? '0',
  accountValue: '0',
  leverageType: 'cross',
  liquidatedPositions: (event.triggeringPositions ?? []).map((p) => ({
    market: resolveMarket(p.market),
    size: p.netQuantity,
  })),
})
