import { getMarkets, PerpsClient, SPOT_CATEGORY_ID } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const settings = { provider: 'hyperliquid', marketId: 'BTC', amount: '1' }

const privateKey = process.env.PRIVATE_KEY
if (!privateKey || !isHex(privateKey)) {
  throw new Error('Set PRIVATE_KEY in .env.')
}
const account = privateKeyToAccount(privateKey)
const perps = new PerpsClient({ providers: [hyperliquidProvider()] })
perps.setUserWallet(
  createWalletClient({ account, chain: arbitrum, transport: http() })
)

const { provider, marketId, amount } = settings
const {
  markets: [market],
} = await getMarkets(perps.client, { provider, marketIds: [marketId] })
if (!market) {
  throw new Error(`Unknown market: ${marketId}`)
}

console.log(
  await perps.sendAsset({
    provider,
    address: account.address,
    collateral: market.quoteAsset.id,
    sourceDex: market.categoryId,
    destinationDex: SPOT_CATEGORY_ID,
    amount,
  })
)
