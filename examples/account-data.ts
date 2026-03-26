import {
  createPerpsClient,
  getAccount,
  getHistory,
  getOrder,
} from '@lifi/perps-sdk'

async function run() {
  const client = createPerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
  })

  // Get account info (balances, positions, open orders)
  const account = await getAccount(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
  })
  console.log('Account:', account)

  // Get order history
  const { items, pagination } = await getHistory(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
    limit: 50,
  })
  console.log('History:', items, pagination)

  // Get specific order
  const order = await getOrder(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
    id: 'order123',
  })
  console.log('Order:', order)
}

run()
