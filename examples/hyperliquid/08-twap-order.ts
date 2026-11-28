import { isSubmittedOrAccepted, OrderSide, PerpsClient } from '@lifi/perps-sdk'
import { LocalJSONFileAdapter } from '@lifi/perps-sdk/node'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const settings = {
  provider: 'hyperliquid',
  market: { marketId: 'BTC', categoryId: 'hyperliquid' },
  size: '0.002',
  durationSeconds: 300,
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

const { provider, market, size, durationSeconds } = settings
const request = { provider, market, address: account.address }
const placed = await perps.placeTwapOrder({
  ...request,
  size,
  durationSeconds,
  side: OrderSide.BUY,
})
const twapId = placed.results.find(isSubmittedOrAccepted)?.twapId
if (!twapId) {
  throw new Error('No TWAP ID returned.', { cause: placed.results })
}

console.log(await perps.cancelTwapOrder({ ...request, twapId }))
