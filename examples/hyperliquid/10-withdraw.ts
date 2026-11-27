// Read the withdrawable balances, then withdraw USDC to Arbitrum.
// Requires a wallet (PRIVATE_KEY) and an account with withdrawable USDC.
// The venue deducts its withdrawal fee from the amount.

// WARNING: this script moves real funds on Hyperliquid mainnet. Hyperliquid
// has no testnet that the SDK can use.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import {
  compareDecimalStrings,
  getMarkets,
  isSubmittedOrAccepted,
  PerpsClient,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import {
  HYPERLIQUID_PROVIDER_KEY,
  hyperliquidProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isAddress, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const provider = HYPERLIQUID_PROVIDER_KEY
const amount = process.env.WITHDRAW_AMOUNT ?? '2'
// The category id of the main Hyperliquid perps dex.
const mainDexCategoryId = 'hyperliquid'

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

const destination = process.env.WITHDRAW_DESTINATION ?? address
if (!isAddress(destination)) {
  throw new Error('Set WITHDRAW_DESTINATION to a 0x-prefixed address.')
}

const perps = new PerpsClient({
  apiKey: process.env.LIFI_API_KEY,
  providers: [hyperliquidProvider({ storage })],
})
// The user wallet signs every withdrawal. The agent cannot withdraw.
perps.setUserWallet(walletClient)

const balances =
  (await perps.getWithdrawableBalances({ provider, address })) ?? []
for (const balance of balances) {
  console.log('Withdrawable:', {
    categoryId: balance.categoryId,
    asset: balance.asset.displaySymbol,
    available: balance.available,
    max: balance.max,
    withdrawalFee: balance.withdrawalFee,
  })
}

// The withdrawal action moves only USDC, the quote asset of the main dex.
const { markets } = await getMarkets(perps.client, { provider })
const quoteAssetId = markets.find(
  (market) => market.categoryId === mainDexCategoryId
)?.quoteAsset.id
const source = balances.find(
  (balance) =>
    balance.asset.id === quoteAssetId &&
    compareDecimalStrings(balance.max, amount) >= 0
)
if (source === undefined) {
  throw new Error(`No USDC balance can fund ${amount}. Lower WITHDRAW_AMOUNT.`)
}
if (
  source.withdrawalFee !== undefined &&
  compareDecimalStrings(amount, source.withdrawalFee) <= 0
) {
  throw new Error(
    `WITHDRAW_AMOUNT must be above the ${source.withdrawalFee} fee.`
  )
}

const { results } = await perps.withdraw({
  provider,
  address,
  withdrawal: { destination, amount, source },
})
for (const result of results) {
  if (!isSubmittedOrAccepted(result)) {
    throw new Error(
      `withdraw: ${result.status} (${result.errorCode}) ${result.error}`
    )
  }
}
console.log(`Withdrew ${amount} USDC to ${destination} on Arbitrum.`)
