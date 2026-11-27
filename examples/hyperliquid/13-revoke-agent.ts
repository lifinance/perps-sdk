import { ActionType, getProviders, PerpsClient } from '@lifi/perps-sdk'
import { LocalJSONFileAdapter } from '@lifi/perps-sdk/node'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const settings = {
  provider: 'hyperliquid',
  storageFile: new URL('.perps-storage.json', import.meta.url),
}

const privateKey = process.env.PRIVATE_KEY
if (!privateKey || !isHex(privateKey)) {
  throw new Error('Set PRIVATE_KEY in .env.')
}
const account = privateKeyToAccount(privateKey)
const storage = new LocalJSONFileAdapter(settings.storageFile)
const perps = new PerpsClient({ providers: [hyperliquidProvider({ storage })] })
perps.setUserWallet(
  createWalletClient({ account, chain: arbitrum, transport: http() })
)

const { provider } = settings
const { providers } = await getProviders(perps.client)
const step = providers
  .find(({ key }) => key === provider)
  ?.setup.find(({ type }) => type === ActionType.APPROVE_AGENT)
if (!step) {
  throw new Error('Hyperliquid does not list an agent approval step.')
}

console.log(
  await perps.executeProviderRevoke({
    provider,
    address: account.address,
    step,
  })
)
