import {
  createPerpsClient,
  getAccount,
  getFills,
  getOrder,
  getOrders,
  getPositions,
} from '@lifi/perps-sdk'

async function run() {
  const client = createPerpsClient({
    apiKey: 'your-api-key',
  })

  // Get account info (balances, margin details)
  const account = await getAccount(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
  })
  console.log('Account:', account)

  // Get open positions
  const { positions } = await getPositions(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
  })
  console.log('Positions:', positions)

  // Get open orders and trigger orders
  const { openOrders, triggerOrders } = await getOrders(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
  })
  console.log('Open orders:', openOrders)
  console.log('Trigger orders:', triggerOrders)

  // Get order fills
  const { items, pagination } = await getFills(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
    limit: 50,
  })
  console.log('Fills:', items, pagination)

  // Get specific order
  const order = await getOrder(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
    id: 'order123',
  })
  console.log('Order:', order)
}

run()
