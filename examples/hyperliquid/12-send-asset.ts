// Move USDC from the perps balance to the spot balance with sendAsset, then
// move it back.
// Requires a wallet (PRIVATE_KEY) and an account with transferable USDC. In
// the Unified Account mode, perps and spot share USDC, and the venue can
// refuse the transfer.

// WARNING: this script moves real funds on Hyperliquid mainnet. Hyperliquid
// has no testnet that the SDK can use.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import {
  getMarkets,
  isSubmittedOrAccepted,
  PerpsClient,
  SPOT_CATEGORY_ID,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import {
  HYPERLIQUID_PROVIDER_KEY,
  hyperliquidProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const provider = HYPERLIQUID_PROVIDER_KEY
const amount = process.env.SEND_AMOUNT ?? '1'
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

const perps = new PerpsClient({
  apiKey: process.env.LIFI_API_KEY,
  providers: [hyperliquidProvider({ storage })],
})
// The user wallet signs every transfer. The agent cannot move funds.
perps.setUserWallet(walletClient)

// `collateral` is the Asset.id of USDC, the quote asset of the main dex.
// Never use a display symbol.
const { markets } = await getMarkets(perps.client, { provider })
const collateral = markets.find(
  (market) => market.categoryId === mainDexCategoryId
)?.quoteAsset.id
if (collateral === undefined) {
  throw new Error('No market of the main dex found.')
}

const transfers = [
  { sourceDex: mainDexCategoryId, destinationDex: SPOT_CATEGORY_ID },
  { sourceDex: SPOT_CATEGORY_ID, destinationDex: mainDexCategoryId },
]
for (const { sourceDex, destinationDex } of transfers) {
  const { results } = await perps.sendAsset({
    provider,
    address,
    collateral,
    sourceDex,
    destinationDex,
    amount,
  })
  for (const result of results) {
    if (!isSubmittedOrAccepted(result)) {
      throw new Error(
        `sendAsset: ${result.status} (${result.errorCode}) ${result.error}`
      )
    }
  }
  console.log(`Sent ${amount} USDC from ${sourceDex} to ${destinationDex}.`)
}
