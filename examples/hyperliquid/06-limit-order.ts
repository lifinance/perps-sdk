// Place a post-only limit order far below the mark price, read it, modify it,
// and cancel it. It checks each result and reads the code of a PerpsError.
// Requires a wallet (PRIVATE_KEY) and an account that 03-onboarding.ts made
// ready. The order rests on the book and does not fill.

// WARNING: this script places a real order on Hyperliquid mainnet.
// Hyperliquid has no testnet that the SDK can use.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import {
  calculateOrderAmounts,
  compareDecimalStrings,
  decimalStringToNumber,
  type ExecuteActionResponse,
  getMarkets,
  getMarketsContext,
  getProviders,
  isSubmittedOrAccepted,
  multiplyDecimalString,
  OrderSide,
  OrderType,
  PerpsClient,
  PerpsError,
  PerpsErrorCode,
  PerpsExecutionError,
  type StorageAdapter,
  snapOrderPrice,
  TimeInForce,
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
// The limit price as a fraction of the mark price. 0.7 keeps a buy far below
// the book, so it rests and does not fill.
const limitPriceRatio = process.env.LIMIT_PRICE_RATIO ?? '0.7'

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

// A venue refusal does not throw. Read the status of every result.
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

const { providers } = await getProviders(perps.client)
const minOrderValueUsd = providers.find(
  (entry) => entry.key === provider
)?.minOrderValueUsd
if (minOrderValueUsd === undefined) {
  throw new Error('The provider advertises no minimum order value.')
}
// 10% above the venue minimum, because the size truncates onto the lot grid.
const notionalUsd =
  process.env.ORDER_NOTIONAL_USD ??
  multiplyDecimalString(minOrderValueUsd, '1.1')

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

const price = snapOrderPrice(
  perps.client,
  market,
  multiplyDecimalString(context.markPrice, limitPriceRatio)
)
const { size, notional } = calculateOrderAmounts({
  sdk: perps.client,
  market,
  held: 'notional',
  amount: notionalUsd,
  leverage: decimalStringToNumber(settings.leverage),
  price,
})
if (compareDecimalStrings(notional, minOrderValueUsd) < 0) {
  throw new Error(
    `The notional ${notional} is too small. Raise ORDER_NOTIONAL_USD.`
  )
}
console.log(`Buy ${size} ${marketId} at ${price} (notional ${notional} USD)`)

try {
  const placed = await perps.placeOrder({
    provider,
    address,
    market: marketRef,
    side: OrderSide.BUY,
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.POST_ONLY,
    size,
    price,
  })
  assertApplied('placeOrder', placed)
  const orderId = placed.results.find((r) => r.orderId)?.orderId
  if (orderId === undefined) {
    throw new Error('The venue returned no order id.')
  }

  const order = await perps.getOrder({ provider, address, id: orderId })
  console.log('Order:', order.orderId, order.status, order.remainingSize)

  // Move the order 1% higher. It stays far below the mark price.
  const newPrice = snapOrderPrice(
    perps.client,
    market,
    multiplyDecimalString(price, '1.01')
  )
  const modified = await perps.modifyOrders({
    provider,
    address,
    modifications: [{ id: orderId, price: newPrice, size }],
    assetId: market.id,
  })
  assertApplied('modifyOrders', modified)
  // A modify can give the order a new venue id.
  const modifiedId = modified.results.find((r) => r.orderId)?.orderId ?? orderId
  console.log(`Modified the order to ${newPrice}: ${modifiedId}`)

  const cancelled = await perps.cancelOrders({
    provider,
    address,
    ids: [modifiedId],
    assetId: market.id,
  })
  assertApplied('cancelOrders', cancelled)
  console.log('Cancelled the order.')
} catch (error) {
  // A failure after a known result carries the results that the venue gave.
  if (error instanceof PerpsExecutionError) {
    console.error('Results before the failure:', error.response.results)
  }
  if (error instanceof PerpsError) {
    switch (error.code) {
      case PerpsErrorCode.AgentUnauthorized:
      case PerpsErrorCode.SetupRequired:
        console.error('The agent is not approved. Run 03-onboarding.ts.')
        break
      case PerpsErrorCode.InsufficientMargin:
      case PerpsErrorCode.InsufficientBalance:
        console.error('Not enough margin. Run 04-deposit.ts.')
        break
      default:
        console.error(`PerpsError ${error.code}:`, error.message)
    }
    process.exitCode = 1
  } else {
    throw error
  }
}
