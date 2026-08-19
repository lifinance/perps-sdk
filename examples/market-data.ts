import {
  createPerpsClient,
  getAssets,
  getMarkets,
  getOhlcv,
  getOrderbook,
  getPrices,
  getProviders,
} from '@lifi/perps-sdk'

async function run() {
  const client = createPerpsClient({
    apiKey: 'your-api-key',
  })

  // Get available providers
  const { providers } = await getProviders(client)
  console.log('Providers:', providers)

  // Get all assets for a provider
  const { assets } = await getAssets(client, { provider: 'hyperliquid' })
  console.log('Assets:', assets)

  // Resolve a market by its opaque Market.id — the OHLCV/orderbook/prices
  // filters key off Market.id, not a display symbol.
  const { markets } = await getMarkets(client, { provider: 'hyperliquid' })
  const btc = markets.find((m) => m.baseAsset.displaySymbol === 'BTC')
  if (!btc) {
    throw new Error('BTC market not found')
  }

  // Get all prices
  const { prices } = await getPrices(client, { provider: 'hyperliquid' })
  console.log('All prices:', prices)

  // Filter prices by opaque Market.id
  const filtered = await getPrices(client, {
    provider: 'hyperliquid',
    marketIds: [btc.id],
  })
  console.log('Filtered prices:', filtered)

  // Get OHLCV candles
  const { candles } = await getOhlcv(client, {
    provider: 'hyperliquid',
    marketId: btc.id,
    interval: '1h',
    limit: 100,
  })
  console.log('Candles:', candles)

  // Get orderbook
  const { bids, asks } = await getOrderbook(client, {
    provider: 'hyperliquid',
    marketId: btc.id,
    depth: 20,
  })
  console.log('Orderbook:', { bids, asks })
}

run()
