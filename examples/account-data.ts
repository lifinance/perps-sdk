import {
  createPerpsClient,
  getAccount,
  getFills,
  getOrder,
  getOrders,
  getPositions,
} from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

// Optional on the production API. Get a key at https://portal.li.fi/.
const API_KEY = 'YOUR_API_KEY'
const USER_ADDRESS = '0xYOUR_WALLET_ADDRESS'

async function run() {
  // Account reads go through the provider plugin, so register it.
  const client = createPerpsClient({
    apiKey: API_KEY,
    providers: [hyperliquidProvider()],
  })

  const account = await getAccount(client, {
    provider: 'hyperliquid',
    address: USER_ADDRESS,
  })
  console.log('Account:', account)

  const { positions } = await getPositions(client, {
    provider: 'hyperliquid',
    address: USER_ADDRESS,
  })
  console.log('Positions:', positions)

  // Without a status filter, getOrders returns the active orders.
  const { orders } = await getOrders(client, {
    provider: 'hyperliquid',
    address: USER_ADDRESS,
  })
  console.log('Orders:', orders)

  const { items, pagination } = await getFills(client, {
    provider: 'hyperliquid',
    address: USER_ADDRESS,
    limit: 50,
  })
  console.log('Fills:', items)
  if (pagination.hasMore) {
    console.log('More fills after cursor:', pagination.cursor)
  }

  const first = orders[0]
  if (first) {
    const order = await getOrder(client, {
      provider: 'hyperliquid',
      address: USER_ADDRESS,
      id: first.orderId,
    })
    console.log('Order:', order)
  }
}

run()
