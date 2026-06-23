import type { MarketContext } from '@lifi/perps-types'
import type { LtWsMarketStats, LtWsSpotMarketStats } from '../types/index.js'

const isPerpStats = (
  stats: LtWsMarketStats | LtWsSpotMarketStats
): stats is LtWsMarketStats => 'mark_price' in stats

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
      volume24h: stats.daily_quote_token_volume,
      openInterest: stats.open_interest,
      funding: {
        rate: stats.current_funding_rate,
        nextFundingTime: stats.funding_timestamp,
      },
    }
  }
  return {
    marketId,
    midPrice: stats.mid_price,
    markPrice: stats.mid_price,
    oraclePrice: stats.index_price,
    volume24h: String(stats.daily_quote_token_volume),
  }
}
