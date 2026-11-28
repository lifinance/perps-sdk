import {
  isSubmittedOrAccepted,
  OrderSide,
  OrderType,
  PerpsClient,
  TimeInForce,
} from '@lifi/perps-sdk'
import { LocalJSONFileAdapter } from '@lifi/perps-sdk/node'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const settings = {
  provider: 'hyperliquid',
  market: { marketId: 'BTC', categoryId: 'hyperliquid' },
  size: '0.0003',
  price: '60000',
  newPrice: '61000',
}

const privateKey = process.env.PRIVATE_KEY
if (!privateKey || !isHex(privateKey)) {
  throw new Error('Set PRIVATE_KEY in .env.')
}
const account = privateKeyToAccount(privateKey)
const storage = new LocalJSONFileAdapter(
  new URL('.perps-storage.json', import.meta.url)
)
const perps = new PerpsClient({ providers: [hyperliquidProvider({ storage })] })
perps.setUserWallet(
  createWalletClient({ account, chain: arbitrum, transport: http() })
)

const request = { provider: settings.provider, address: account.address }
const { market, price, size, newPrice } = settings
const placed = await perps.placeOrder({
  ...request,
  market,
  size,
  price,
  side: OrderSide.BUY,
  type: OrderType.LIMIT,
  timeInForce: TimeInForce.POST_ONLY,
})
const orderId = placed.results.find(isSubmittedOrAccepted)?.orderId
if (!orderId) {
  throw new Error('No order ID returned.', { cause: placed.results })
}

console.log(await perps.getOrder({ ...request, id: orderId }))

const modified = await perps.modifyOrders({
  ...request,
  assetId: market.marketId,
  modifications: [{ id: orderId, size, price: newPrice }],
})
const result = modified.results.find(isSubmittedOrAccepted)
if (!result) {
  throw new Error('Order modification failed.', { cause: modified.results })
}

console.log(
  await perps.cancelOrders({
    ...request,
    assetId: market.marketId,
    ids: [result.orderId ?? orderId],
  })
)
