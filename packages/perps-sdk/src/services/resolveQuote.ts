import {
  type FeeTier,
  type Market,
  type MarketPrice,
  PerpsErrorCode,
  type Quote,
} from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import type { SDKRequestOptions } from '../types/config.js'
import type {
  PerpsSDKClient,
  ProviderGetQuoteParams,
} from '../types/provider.js'
import { buildQuote } from '../utils/calculations.js'
import { getMarkets } from './getMarkets.js'
import { getOrderbook } from './getOrderbook.js'
import { getPrices } from './getPrices.js'

/**
 * Shared provider-side `getQuote` implementation: resolve `params.symbol` to a
 * market on `provider` (matching `baseAsset.displaySymbol`, scoped by
 * `params.type`), fetch the orderbook snapshot, and build the {@link Quote}
 * with the provider's public base `feeTier`. Both venue plugins delegate here
 * so symbol resolution and the book walk live in one place; each plugin only
 * supplies its own base tier.
 *
 * @throws {PerpsError} `MarketNotFound` when no market matches symbol+type.
 * @internal
 */
export async function resolveQuote(
  client: PerpsSDKClient,
  provider: string,
  params: ProviderGetQuoteParams,
  feeTier: FeeTier,
  options?: SDKRequestOptions
): Promise<Quote> {
  const market = await resolveQuoteMarket(client, provider, params, options)

  const [{ bids, asks }, price] = await Promise.all([
    getOrderbook(client, { provider, marketId: market.id }, options),
    resolveQuotePrice(client, provider, market.id, options),
  ])

  return buildQuote({
    provider,
    symbol: params.symbol,
    type: params.type,
    side: params.side,
    sizeUsd: params.size,
    market,
    price,
    bids,
    asks,
    feeTier,
    timestamp: Date.now(),
  })
}

/**
 * Resolve `params.symbol` to a market on `provider` (matching
 * `baseAsset.displaySymbol`, scoped by `params.type`). Shared by the one-shot
 * {@link resolveQuote} and the streaming quote subscription so both quote the
 * same market for a given symbol+type.
 *
 * @throws {PerpsError} `MarketNotFound` when no market matches symbol+type.
 * @internal
 */
export async function resolveQuoteMarket(
  client: PerpsSDKClient,
  provider: string,
  params: Pick<ProviderGetQuoteParams, 'symbol' | 'type'>,
  options?: SDKRequestOptions
): Promise<Market> {
  const { markets } = await getMarkets(client, { provider }, options)
  const market = markets.find(
    (m) =>
      m.baseAsset.displaySymbol === params.symbol &&
      isMarketOfType(m, params.type)
  )
  if (market === undefined) {
    throw new PerpsError(
      PerpsErrorCode.MarketNotFound,
      `No ${params.type} market found on '${provider}' for symbol '${params.symbol}'.`
    )
  }
  return market
}

const isMarketOfType = (
  market: Market,
  type: ProviderGetQuoteParams['type']
): boolean => ('maxLeverage' in market ? type === 'perps' : type === 'spot')

/**
 * Fetch the live {@link MarketPrice} for `marketId` on `provider`, the source
 * of the `markPrice` and `funding` a {@link Quote} carries. Shared by the
 * one-shot {@link resolveQuote} and the streaming quote subscription.
 *
 * @throws {PerpsError} `ServerError` when the provider returns no price for the
 * market.
 * @internal
 */
export async function resolveQuotePrice(
  client: PerpsSDKClient,
  provider: string,
  marketId: string,
  options?: SDKRequestOptions
): Promise<MarketPrice> {
  const { prices } = await getPrices(
    client,
    { provider, marketIds: [marketId] },
    options
  )
  const price = prices.find((p) => p.marketId === marketId)
  if (price === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ServerError,
      `No price returned by '${provider}' for marketId '${marketId}'.`
    )
  }
  return price
}
