import {
  createPerpsClient,
  getAccount,
  getFills,
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
