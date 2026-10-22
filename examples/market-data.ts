import {
  createPerpsClient,
  getAssets,
  getMarket,
  getMarkets,
  getMarketsContext,
  getOhlcv,
  getOrderbook,
  getProviders,
} from '@lifi/perps-sdk'

// Optional on the production API. Get a key at https://portal.li.fi/.
const API_KEY = 'YOUR_API_KEY'

async function run() {
  // Market data reads need no provider plugin.
  const client = createPerpsClient({ apiKey: API_KEY })

  const { providers } = await getProviders(client)
  console.log(
    'Providers:',
    providers.map((p) => p.key)
  )

  const { assets } = await getAssets(client, { provider: 'hyperliquid' })
  console.log('Assets:', assets.length)

  const { markets } = await getMarkets(client, { provider: 'hyperliquid' })
  console.log('Markets:', markets.length)

  // marketId is the opaque Market.id, not a display symbol.
  const btc = await getMarket(client, {
    provider: 'hyperliquid',
    marketId: 'BTC',
  })

  const { prices } = await getMarketsContext(client, {
    provider: 'hyperliquid',
  })
  console.log('Market contexts:', prices.length)

  const { prices: btcPrices } = await getMarketsContext(client, {
    provider: 'hyperliquid',
    marketIds: [btc.id],
  })
  console.log('BTC mid/mark:', btcPrices[0]?.midPrice, btcPrices[0]?.markPrice)

  const { candles } = await getOhlcv(client, {
    provider: 'hyperliquid',
    marketId: btc.id,
    interval: '1h',
    limit: 100,
  })
  console.log('Candles:', candles.length)

  const { bids, asks } = await getOrderbook(client, {
    provider: 'hyperliquid',
    marketId: btc.id,
    depth: 20,
  })
  console.log('Best bid/ask:', bids[0]?.price, asks[0]?.price)
}

run()
