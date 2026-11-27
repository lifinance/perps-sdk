// Read public Hyperliquid market data: providers, markets, the orderbook,
// candles, funding history, and a quote. Requires no wallet and no account.
import {
  createPerpsClient,
  getFundingHistory,
  getMarkets,
  getOhlcv,
  getOrderbook,
  getProviders,
  getQuote,
} from '@lifi/perps-sdk'
import {
  HYPERLIQUID_PROVIDER_KEY,
  hyperliquidProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'

const provider = HYPERLIQUID_PROVIDER_KEY
const marketId = process.env.MARKET_ID ?? 'BTC'
const quoteSizeUsd = process.env.QUOTE_SIZE_USD ?? '1000'

const client = createPerpsClient({
  apiKey: process.env.LIFI_API_KEY,
  providers: [hyperliquidProvider()],
})

const { providers } = await getProviders(client)
const metadata = providers.find((entry) => entry.key === provider)
if (metadata === undefined) {
  throw new Error(`The backend does not list the '${provider}' provider.`)
}
console.log(
  'Providers:',
  providers.map((entry) => entry.key)
)
console.log(
  'Hyperliquid categories:',
  metadata.categories.map((c) => c.id)
)

// Market.id is opaque. Every market read below takes it, not a display symbol.
const { markets } = await getMarkets(client, { provider })
const market = markets.find((entry) => entry.id === marketId)
if (market === undefined) {
  throw new Error(`Market '${marketId}' not found. Set MARKET_ID.`)
}
console.log(`Markets: ${markets.length}, selected:`, {
  id: market.id,
  categoryId: market.categoryId,
  base: market.baseAsset.displaySymbol,
  quote: market.quoteAsset.displaySymbol,
})

const orderbook = await getOrderbook(client, { provider, marketId, depth: 5 })
console.log('Best bid:', orderbook.bids[0], 'best ask:', orderbook.asks[0])

// Pick an interval and a funding range that the provider supports.
const interval = metadata.supportedIntervals.includes('1h')
  ? '1h'
  : metadata.supportedIntervals[0]
const { candles } = await getOhlcv(client, {
  provider,
  marketId,
  interval,
  limit: 24,
})
console.log(`Candles (${interval}): ${candles.length}, last:`, candles.at(-1))

const [range] = metadata.fundingHistoryRanges
const funding = await getFundingHistory(client, { provider, marketId, range })
console.log(
  `Funding points (${range}): ${funding.points.length}, last:`,
  funding.points.at(-1)
)

// A quote walks the orderbook for a USD notional. getQuote takes the display
// symbol, which the provider resolves.
const quote = await getQuote(client, {
  provider,
  symbol: market.baseAsset.displaySymbol,
  side: 'buy',
  size: quoteSizeUsd,
  type: 'perps',
})
console.log('Quote:', {
  baseSize: quote.baseSize,
  expectedFillPrice: quote.expectedFillPrice,
  priceImpactBps: quote.priceImpactBps,
  feeUsd: quote.feeUsd,
  insufficientLiquidity: quote.insufficientLiquidity,
})
