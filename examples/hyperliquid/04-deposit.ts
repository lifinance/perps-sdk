import { PerpsClient } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import {
  convertQuoteToRoute,
  createClient,
  executeRoute,
  getQuote,
  getToken,
} from '@lifi/sdk'
import { EthereumProvider } from '@lifi/sdk-provider-ethereum'
import { createWalletClient, http, isHex, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const settings = {
  provider: 'hyperliquid',
  token: 'USDC',
  amount: '10',
  minimumCredit: '5',
}

const privateKey = process.env.PRIVATE_KEY
if (!privateKey || !isHex(privateKey)) {
  throw new Error('Set PRIVATE_KEY in .env.')
}
const account = privateKeyToAccount(privateKey)
const wallet = createWalletClient({
  account,
  chain: arbitrum,
  transport: http(),
})
const perps = new PerpsClient({ providers: [hyperliquidProvider()] })

const flow = await perps.getDepositFlow({
  provider: settings.provider,
  address: account.address,
})
if (flow?.kind !== 'lifiSwap') {
  throw new Error('Expected a LI.FI deposit route.')
}

const lifi = createClient({
  integrator: 'perps-sdk-examples',
  providers: [EthereumProvider({ getWalletClient: async () => wallet })],
})
const token = await getToken(lifi, arbitrum.id, settings.token)
const quote = await getQuote(lifi, {
  fromChain: arbitrum.id,
  fromToken: token.address,
  fromAmount: parseUnits(settings.amount, token.decimals).toString(),
  fromAddress: account.address,
  toChain: flow.destination.chainId,
  toToken: flow.destination.address,
  toAddress: flow.toAddress ?? account.address,
})
if (
  BigInt(quote.estimate.toAmountMin) <
  parseUnits(settings.minimumCredit, flow.destination.decimals)
) {
  throw new Error('The deposit quote is below the minimum credit.')
}
console.log(
  'Deposit route:',
  (await executeRoute(lifi, convertQuoteToRoute(quote))).id
)
