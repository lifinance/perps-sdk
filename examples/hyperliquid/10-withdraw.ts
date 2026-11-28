import { PerpsClient } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const settings = { provider: 'hyperliquid', amount: '2' }

const privateKey = process.env.PRIVATE_KEY
if (!privateKey || !isHex(privateKey)) {
  throw new Error('Set PRIVATE_KEY in .env.')
}
const account = privateKeyToAccount(privateKey)
const perps = new PerpsClient({ providers: [hyperliquidProvider()] })
perps.setUserWallet(
  createWalletClient({ account, chain: arbitrum, transport: http() })
)

const request = { provider: settings.provider, address: account.address }
const balances = await perps.getWithdrawableBalances(request)
const source = balances?.find(({ asset }) => asset.displaySymbol === 'USDC')
if (!source) {
  throw new Error('No withdrawable USDC.')
}

console.log(
  await perps.withdraw({
    ...request,
    withdrawal: {
      destination: account.address,
      amount: settings.amount,
      source,
    },
  })
)
