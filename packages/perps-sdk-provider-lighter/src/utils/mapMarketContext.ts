import { numberToDecimalString } from '@lifi/perps-sdk'
import type { MarketContext } from '@lifi/perps-types'
import type { LtWsMarketStats, LtWsSpotMarketStats } from '../types/index.js'

const FUNDING_PERIOD_MS = 60 * 60 * 1000

const isPerpStats = (
  stats: LtWsMarketStats | LtWsSpotMarketStats
): stats is LtWsMarketStats => 'mark_price' in stats

const isFiniteFigure = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * The 24h figures of one record, omitted where the frame carries no finite
 * number. The venue publishes them as unvalidated JSON, and `market_stats/all`
 * maps every market in one pass, so a single absent figure must not cost the
 * whole frame.
 */
const dailyFigures = (stats: {
  daily_price_change?: number | null
  daily_quote_token_volume?: number | null
}): Pick<MarketContext, 'priceChange24h' | 'volume24h'> => ({
  ...(isFiniteFigure(stats.daily_price_change)
    ? { priceChange24h: numberToDecimalString(stats.daily_price_change) }
    : {}),
  ...(isFiniteFigure(stats.daily_quote_token_volume)
    ? { volume24h: numberToDecimalString(stats.daily_quote_token_volume) }
    : {}),
})

/**
 * Map a Lighter market-stats record to a {@link MarketContext}: `index_price`
 * is the oracle, `mid_price` the mid. Perp records carry the venue
 * `mark_price`, funding and open interest; spot records have none, so mark
 * falls back to the mid and the perp-only fields stay `undefined`.
 * @public
 */
export const mapMarketContext = (
  stats: LtWsMarketStats | LtWsSpotMarketStats
): MarketContext => {
  const marketId = String(stats.market_id)
  if (isPerpStats(stats)) {
    return {
      marketId,
      midPrice: stats.mid_price,
      markPrice: stats.mark_price,
      oraclePrice: stats.index_price,
      ...dailyFigures(stats),
      openInterest: stats.open_interest,
      funding: {
        rate: stats.current_funding_rate,
        nextFundingTime: stats.funding_timestamp + FUNDING_PERIOD_MS,
      },
    }
  }
  return {
    marketId,
    midPrice: stats.mid_price,
    markPrice: stats.mid_price,
    oraclePrice: stats.index_price,
    ...dailyFigures(stats),
  }
}
