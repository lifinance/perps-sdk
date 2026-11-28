import {
  absDecimalString,
  getPositions,
  isSubmittedOrAccepted,
  MarginMode,
  OrderSide,
  OrderType,
  PerpsClient,
  resolveCloseSize,
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
  leverage: 2,
  maxEntryPrice: '71000',
  minClosePrice: '69000',
  takeProfit: {
    type: OrderType.MARKET,
    triggerPrice: '75000',
    limitPrice: '74250',
  },
  stopLoss: {
    type: OrderType.MARKET,
    triggerPrice: '65000',
    limitPrice: '64350',
  },
} as const

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

const { provider, market, size, leverage, takeProfit, stopLoss } = settings
const request = { provider, address: account.address }
const read = { ...request, marketId: market.marketId }
const { positions: existing } = await getPositions(perps.client, read)
if (existing.some((position) => position.market.id === market.marketId)) {
  throw new Error('Use a market with no open position.')
}

const order = { ...request, market, type: OrderType.MARKET } as const
const opened = await perps.placeOrder({
  ...order,
  side: OrderSide.BUY,
  size,
  price: settings.maxEntryPrice,
  leverage,
  marginMode: MarginMode.ISOLATED,
  takeProfit,
  stopLoss,
})
if (opened.results.some((result) => !isSubmittedOrAccepted(result))) {
  throw new Error('Check the account before you continue.', {
    cause: opened.results,
  })
}

const { positions } = await getPositions(perps.client, read)
const position = positions.find((entry) => entry.market.id === market.marketId)
if (!position) {
  throw new Error('No position yet. Check fills before you retry.')
}

console.log(
  await perps.placeOrder({
    ...order,
    side: OrderSide.SELL,
    size: resolveCloseSize('0', absDecimalString(position.size)),
    price: settings.minClosePrice,
    reduceOnly: true,
  })
)
