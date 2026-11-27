import { PerpsClient } from '@lifi/perps-sdk'
import { LocalJSONFileAdapter } from '@lifi/perps-sdk/node'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const settings = {
  provider: 'hyperliquid',
  market: { marketId: 'BTC', categoryId: 'hyperliquid' },
  action: 'add',
  amount: '1',
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

console.log(
  await perps.updatePositionMargin({ ...settings, address: account.address })
)
