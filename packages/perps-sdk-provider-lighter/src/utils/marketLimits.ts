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

/** Map the order-value cap published by Lighter's order-book metadata. */
export const mapMarketOrderLimits = (
  market: LighterMarketLimitSource
): MarketOrderLimits => ({
  maxMarketOrderUsd: market.order_quote_limit,
  maxLimitOrderUsd: market.order_quote_limit,
})
