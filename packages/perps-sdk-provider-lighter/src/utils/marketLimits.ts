import type { PerpsMarket } from '@lifi/perps-types'
import type { LtPerpsOrderBookDetail } from '../types/index.js'

type MarketOrderLimits = Pick<
  PerpsMarket,
  'maxMarketOrderUsd' | 'maxLimitOrderUsd'
>

type LighterMarketLimitSource = Pick<
  LtPerpsOrderBookDetail,
  'order_quote_limit'
>

const NO_ORDER_QUOTE_LIMIT = '281474976.710655'

/** Map the order-value cap published by Lighter's order-book metadata. */
export const mapMarketOrderLimits = (
  market: LighterMarketLimitSource
): MarketOrderLimits => {
  if (market.order_quote_limit === NO_ORDER_QUOTE_LIMIT) {
    return {}
  }

  return {
    maxMarketOrderUsd: market.order_quote_limit,
    maxLimitOrderUsd: market.order_quote_limit,
  }
}
