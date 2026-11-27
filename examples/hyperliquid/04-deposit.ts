// Deposit to an existing Hyperliquid account. The SDK names the destination
// with getDepositFlow, and @lifi/sdk runs the route.
// Requires a wallet (PRIVATE_KEY), an existing account, and USDC and ETH gas
// on Arbitrum.

// WARNING: this script moves real funds on mainnet. Hyperliquid has no
// testnet that the SDK can use.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { getProviders, PerpsClient, type StorageAdapter } from '@lifi/perps-sdk'
import {
  HYPERLIQUID_PROVIDER_KEY,
  hyperliquidProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'
import {
  convertQuoteToRoute,
  createClient,
  executeRoute,
  getQuote,
  getToken,
} from '@lifi/sdk'
import { EthereumProvider } from '@lifi/sdk-provider-ethereum'
import { createWalletClient, formatUnits, http, isHex, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const provider = HYPERLIQUID_PROVIDER_KEY
const depositAmount = process.env.DEPOSIT_AMOUNT ?? '10'
const depositToken = process.env.DEPOSIT_TOKEN ?? 'USDC'

// WARNING: this file holds the Hyperliquid agent private key in plaintext.
// Keep it out of version control, and delete it when you are done.
const storageFile = new URL('.perps-storage.json', import.meta.url)

async function readStorage(): Promise<Record<string, string>> {
  if (!existsSync(storageFile)) {
    return {}
  }
  return JSON.parse(await readFile(storageFile, 'utf8'))
}

async function writeStorage(values: Record<string, string>): Promise<void> {
  await writeFile(storageFile, JSON.stringify(values, null, 2), {
    mode: 0o600,
  })
}

const storage: StorageAdapter = {
  get: async (key) => (await readStorage())[key] ?? null,
  set: async (key, value) => {
    await writeStorage({ ...(await readStorage()), [key]: value })
  },
  remove: async (key) => {
    const { [key]: _removed, ...values } = await readStorage()
    await writeStorage(values)
  },
}

const privateKey = process.env.PRIVATE_KEY
if (privateKey === undefined || !isHex(privateKey)) {
  throw new Error('Set PRIVATE_KEY to the 0x-prefixed wallet private key.')
}
const account = privateKeyToAccount(privateKey)
const address = account.address
const walletClient = createWalletClient({
  account,
  chain: arbitrum,
  transport: http(),
})

const perps = new PerpsClient({
  apiKey: process.env.LIFI_API_KEY,
  providers: [hyperliquidProvider({ storage })],
})
perps.setUserWallet(walletClient)

if (!(await perps.accountExists(provider, address))) {
  throw new Error('No Hyperliquid account exists. Run 03-onboarding.ts first.')
}

const { providers } = await getProviders(perps.client)
const minDepositUsd =
  providers.find((entry) => entry.key === provider)?.minDepositUsd ?? '0'

// Select the destination by chain id and address, never by symbol.
const flow = await perps.getDepositFlow({ provider, address })
if (flow?.kind !== 'lifiSwap') {
  throw new Error(`Unexpected deposit flow: ${flow?.kind}`)
}
console.log('Deposit destination:', flow.destination)

const lifi = createClient({
  integrator: 'perps-sdk-examples',
  apiKey: process.env.LIFI_API_KEY,
  providers: [EthereumProvider({ getWalletClient: async () => walletClient })],
})
const fromToken = await getToken(lifi, arbitrum.id, depositToken)
const quote = await getQuote(lifi, {
  fromChain: arbitrum.id,
  fromToken: fromToken.address,
  fromAmount: parseUnits(depositAmount, fromToken.decimals).toString(),
  fromAddress: address,
  toChain: flow.destination.chainId,
  toToken: flow.destination.address,
  toAddress: flow.toAddress ?? address,
})
// The venue does not credit a deposit below its minimum.
const minimum = parseUnits(minDepositUsd, flow.destination.decimals)
if (BigInt(quote.estimate.toAmountMin) < minimum) {
  throw new Error(
    `The deposit can arrive below ${minDepositUsd} USD. Raise DEPOSIT_AMOUNT.`
  )
}

console.log(`Depositing ${depositAmount} ${fromToken.symbol}...`)
const route = await executeRoute(lifi, convertQuoteToRoute(quote), {
  updateRouteHook: (updated) =>
    console.log('Route status:', updated.steps[0]?.execution?.status),
})
console.log(
  'Deposit complete. Estimated credit:',
  formatUnits(BigInt(route.toAmount), flow.destination.decimals)
)
