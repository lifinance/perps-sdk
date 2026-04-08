import {
  createPerpsClient,
  getAsset,
  getAssets,
  getOhlcv,
  getOrderbook,
  getPrices,
  getProviders,
} from '@lifi/perps-sdk'

async function run() {
  const client = createPerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
  })

  // Get available providers
  const { providers } = await getProviders(client)
  console.log('Providers:', providers)

  // Get all assets for a provider
  const { assets } = await getAssets(client, { provider: 'hyperliquid' })
  console.log('Assets:', assets)

  // Get a specific asset
  const asset = await getAsset(client, {
    provider: 'hyperliquid',
    symbol: 'BTC',
  })
  console.log('Asset:', asset)

  // Get prices
  const { prices } = await getPrices(client, { provider: 'hyperliquid' })
  console.log('All prices:', prices)

  const filtered = await getPrices(client, {
    provider: 'hyperliquid',
    symbols: ['BTC', 'ETH'],
  })
  console.log('Filtered prices:', filtered)

  // Get OHLCV candles
  const { candles } = await getOhlcv(client, {
    provider: 'hyperliquid',
    symbol: 'BTC',
    interval: '1h',
    limit: 100,
  })
  console.log('Candles:', candles)

  // Get orderbook
  const { bids, asks } = await getOrderbook(client, {
    provider: 'hyperliquid',
    symbol: 'BTC',
    depth: 20,
  })
  console.log('Orderbook:', { bids, asks })
}

run()
