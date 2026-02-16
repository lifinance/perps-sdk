import {
  createPerpsClient,
  getDexes,
  getMarket,
  getMarkets,
  getOhlcv,
  getOrderbook,
  getPrices,
} from '@lifi/perps-sdk'

async function run() {
  const client = createPerpsClient({ integrator: 'my-app' })

  // Get available DEXes
  const { dexes } = await getDexes(client)
  console.log('DEXes:', dexes)

  // Get markets for a DEX
  const { markets } = await getMarkets(client, { dex: 'hyperliquid' })
  console.log('Markets:', markets)

  // Get a specific market
  const market = await getMarket(client, { dex: 'hyperliquid', symbol: 'BTC' })
  console.log('Market:', market)

  // Get prices
  const { prices } = await getPrices(client, { dex: 'hyperliquid' })
  console.log('All prices:', prices)

  const filtered = await getPrices(client, {
    dex: 'hyperliquid',
    symbols: ['BTC', 'ETH'],
  })
  console.log('Filtered prices:', filtered)

  // Get OHLCV candles
  const { candles } = await getOhlcv(client, {
    dex: 'hyperliquid',
    symbol: 'BTC',
    interval: '1h',
    limit: 100,
  })
  console.log('Candles:', candles)

  // Get orderbook
  const { bids, asks } = await getOrderbook(client, {
    dex: 'hyperliquid',
    symbol: 'BTC',
    depth: 20,
  })
  console.log('Orderbook:', { bids, asks })
}

run()
