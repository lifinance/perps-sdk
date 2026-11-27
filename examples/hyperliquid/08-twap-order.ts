// Place a TWAP order, then cancel it.
// Requires a wallet (PRIVATE_KEY), an account that 03-onboarding.ts made
// ready, and margin for the TWAP notional.

// WARNING: this script places a real TWAP order on Hyperliquid mainnet. The
// venue can fill a slice before the cancel, and then you hold a position.
// Hyperliquid has no testnet that the SDK can use.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import {
  calculateOrderAmounts,
  decimalStringToNumber,
  type ExecuteActionResponse,
  getMarkets,
  getMarketsContext,
  getPositions,
  isSubmittedOrAccepted,
  OrderSide,
  PerpsClient,
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
const marketId = process.env.MARKET_ID ?? 'BTC'
// Hyperliquid accepts a TWAP of 100 USD notional or more, over 5 minutes to
// 7 days. The provider does not advertise these limits.
const notionalUsd = process.env.TWAP_NOTIONAL_USD ?? '110'
const durationSeconds = Number(process.env.TWAP_DURATION_SECONDS ?? '300')

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

function assertApplied(label: string, { results }: ExecuteActionResponse) {
  for (const result of results) {
    if (!isSubmittedOrAccepted(result)) {
      throw new Error(
        `${label}: ${result.status} (${result.errorCode}) ${result.error}`
      )
    }
  }
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

const setup = await perps.checkSetup({ provider, address })
if (!setup.isReady) {
  throw new Error('The account is not ready to trade. Run 03-onboarding.ts.')
}

const { markets } = await getMarkets(perps.client, {
  provider,
  marketIds: [marketId],
})
const [market] = markets
if (market === undefined) {
  throw new Error(`Market '${marketId}' not found. Set MARKET_ID.`)
}
const marketRef = { marketId: market.id, categoryId: market.categoryId }
const {
  prices: [context],
} = await getMarketsContext(perps.client, { provider, marketIds: [marketId] })
if (context === undefined) {
  throw new Error(`No mark price for '${marketId}'.`)
}
const settings = await perps.getMarketSettings({
  provider,
  address,
  market: marketRef,
})
const { size } = calculateOrderAmounts({
  sdk: perps.client,
  market,
  held: 'notional',
  amount: notionalUsd,
  leverage: decimalStringToNumber(settings.leverage),
  price: context.markPrice,
})

const placed = await perps.placeTwapOrder({
  provider,
  address,
  market: marketRef,
  side: OrderSide.BUY,
  size,
  durationSeconds,
  randomize: false,
})
assertApplied('placeTwapOrder', placed)
const twapId = placed.results.find((r) => r.twapId)?.twapId
if (twapId === undefined) {
  throw new Error('The venue returned no TWAP id.')
}
console.log(`Placed TWAP ${twapId}: buy ${size} ${marketId}.`)

const cancelled = await perps.cancelTwapOrder({
  provider,
  address,
  market: marketRef,
  twapId,
})
assertApplied('cancelTwapOrder', cancelled)
console.log(`Cancelled TWAP ${twapId}.`)

const { positions } = await getPositions(perps.client, {
  provider,
  address,
  marketId,
})
for (const position of positions) {
  console.log(
    `Open ${marketId} position after the cancel: ${position.side} ${position.size}`
  )
}
