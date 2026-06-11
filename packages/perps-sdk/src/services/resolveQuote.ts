import {
  type FeeTier,
  type Market,
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

  const { bids, asks } = await getOrderbook(
    client,
    { provider, marketId: market.id },
    options
  )

  return buildQuote({
    provider,
    symbol: params.symbol,
    type: params.type,
    side: params.side,
    sizeUsd: params.size,
    market,
    bids,
    asks,
    feeTier,
    timestamp: Date.now(),
  })
}

const isMarketOfType = (
  market: Market,
  type: ProviderGetQuoteParams['type']
): boolean => ('funding' in market ? type === 'perps' : type === 'spot')
