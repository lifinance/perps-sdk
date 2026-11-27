import {
  createPerpsClient,
  getFundingHistory,
  getMarkets,
  getOhlcv,
  getOrderbook,
  getProviders,
  getQuote,
} from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const settings = {
  provider: 'hyperliquid',
  marketId: 'BTC',
  interval: '1h',
  fundingRange: '7d',
  quoteSizeUsd: '1000',
} as const

const { provider, marketId } = settings
const client = createPerpsClient({
  providers: [hyperliquidProvider()],
})

const { providers } = await getProviders(client)
console.log(
  'Providers:',
  providers.map(({ key }) => key)
)

const { markets } = await getMarkets(client, {
  provider,
  marketIds: [marketId],
})
const [market] = markets
if (!market) {
  throw new Error(`Unknown market: ${marketId}`)
}
console.log('Market:', market.id, market.baseAsset.displaySymbol)

const { bids, asks } = await getOrderbook(client, {
  provider,
  marketId,
  depth: 5,
})
console.log('Best bid and ask:', bids[0], asks[0])

const { candles } = await getOhlcv(client, {
  provider,
  marketId,
  interval: settings.interval,
})
console.log('Latest candle:', candles.at(-1))

const { points } = await getFundingHistory(client, {
  provider,
  marketId,
  range: settings.fundingRange,
})
console.log('Latest funding rate:', points.at(-1))

console.log(
  'Quote:',
  await getQuote(client, {
    provider,
    symbol: market.baseAsset.displaySymbol,
    side: 'buy',
    size: settings.quoteSizeUsd,
    type: 'perps',
  })
)
