import type { DecimalString } from './decimal.js'
import type { ProviderId } from './primitives.js'

/** Lookback window of a settled funding average. @public */
export type FundingWindow = '8h' | '24h' | '3d' | '7d'

/** Lookback window of a funding history read. @public */
export type FundingHistoryRange = '7d' | '30d' | '90d'

/**
 * Settled funding averages of one perps market. The open hour is not
 * included; its live rate is `MarketContext.funding.rate`.
 * @public
 */
export interface MarketFundingAverages {
  provider: ProviderId
  marketId: string
  /** Average settled funding rate of each window, as a fraction for one hour (the unit of `MarketContext.funding.rate`). Positive: the long pays. */
  rate: Record<FundingWindow, DecimalString>
  /** First settled funding, in Unix ms. A window that starts before it covers only the time from here. */
  coveredFrom: number
}

/** Settled funding averages of the requested markets. @public */
export interface FundingAveragesResponse {
  averages: MarketFundingAverages[]
}

/** One bucket of a funding history. @public */
export interface FundingHistoryPoint {
  /** Start of the bucket, in Unix ms. */
  timestamp: number
  /** Average settled funding rate in the bucket, as a fraction for one hour (the unit of `MarketContext.funding.rate`). Positive: the long pays. */
  rate: DecimalString
}

/** Settled funding history of one perps market over the requested range. @public */
export interface FundingHistoryResponse {
  provider: ProviderId
  marketId: string
  range: FundingHistoryRange
  /** Oldest first. A bucket with no settled rate has no point. */
  points: FundingHistoryPoint[]
}
