// Open an isolated position, add margin to it with updatePositionMargin, then
// close it with a reduce-only order.
// Requires a wallet (PRIVATE_KEY), an account that 03-onboarding.ts made
// ready, and margin for the smallest order plus the added margin.

// WARNING: this script opens and closes a real position on Hyperliquid
// mainnet. You pay fees and slippage. Hyperliquid has no testnet that the SDK
// can use.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  absDecimalString,
  calculateOrderAmounts,
  calculateSlippagePrice,
  compareDecimalStrings,
  type ExecuteActionResponse,
  getMarkets,
  getMarketsContext,
  getPositions,
  getProviders,
  isSubmittedOrAccepted,
  MarginMode,
  multiplyDecimalString,
  OrderSide,
  OrderType,
  PerpsClient,
  type Position,
  PositionMarginAdjustment,
  type StorageAdapter,
  snapOrderPrice,
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
const leverage = Number(process.env.LEVERAGE ?? '2')
const marginAmount = process.env.MARGIN_AMOUNT ?? '1'

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

const slippagePercent =
  process.env.SLIPPAGE_PERCENT ??
  perps.client.getProvider(provider)?.triggerOrders?.marketSlippage?.default
if (slippagePercent === undefined) {
  throw new Error('Set SLIPPAGE_PERCENT.')
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
if (market === undefined || !('maxLeverage' in market)) {
  throw new Error(`Perps market '${marketId}' not found. Set MARKET_ID.`)
}
if (market.positionMarginAdjustment === PositionMarginAdjustment.NONE) {
  throw new Error(`'${marketId}' accepts no margin change. Set MARKET_ID.`)
}
if (leverage > market.maxLeverage) {
  throw new Error(`LEVERAGE is above the maximum of ${market.maxLeverage}.`)
}
const marketRef = { marketId: market.id, categoryId: market.categoryId }

async function readMarkPrice(): Promise<string> {
  const {
    prices: [context],
  } = await getMarketsContext(perps.client, { provider, marketIds: [marketId] })
  if (context === undefined) {
    throw new Error(`No mark price for '${marketId}'.`)
  }
  return context.markPrice
}

async function readPosition(): Promise<Position | undefined> {
  const { positions } = await getPositions(perps.client, {
    provider,
    address,
    marketId,
  })
  return positions.find((entry) => entry.market.id === market.id)
}

// 1. Open. On Hyperliquid, `leverage` with `marginMode` prepends a leverage
//    update that sets the isolated mode.
const markPrice = await readMarkPrice()
const { size, notional } = calculateOrderAmounts({
  sdk: perps.client,
  market,
  held: 'notional',
  amount: notionalUsd,
  leverage,
  price: markPrice,
})
if (compareDecimalStrings(notional, minOrderValueUsd) < 0) {
  throw new Error(
    `The notional ${notional} is too small. Raise ORDER_NOTIONAL_USD.`
  )
}
assertApplied(
  'placeOrder',
  await perps.placeOrder({
    provider,
    address,
    market: marketRef,
    side: OrderSide.BUY,
    type: OrderType.MARKET,
    size,
    price: snapOrderPrice(
      perps.client,
      market,
      calculateSlippagePrice(markPrice, slippagePercent, true)
    ),
    leverage,
    marginMode: MarginMode.ISOLATED,
  })
)

// The venue can report the position a moment after the fill.
let position: Position | undefined
for (let attempt = 0; position === undefined && attempt < 5; attempt++) {
  await sleep(2_000)
  position = await readPosition()
}
if (position === undefined) {
  throw new Error(`No open ${marketId} position found.`)
}
console.log(
  `Opened ${position.size} ${marketId}, margin ${position.marginUsed}.`
)

// 2. Add margin. The amount is in the collateral units of the venue (USDC).
assertApplied(
  'updatePositionMargin',
  await perps.updatePositionMargin({
    provider,
    address,
    market: marketRef,
    action: 'add',
    amount: marginAmount,
  })
)
const updated = await readPosition()
console.log(`Added ${marginAmount} USDC. Margin: ${updated?.marginUsed}.`)

// 3. Close the full position with a reduce-only sell.
assertApplied(
  'close',
  await perps.placeOrder({
    provider,
    address,
    market: marketRef,
    side: OrderSide.SELL,
    type: OrderType.MARKET,
    size: absDecimalString(position.size),
    price: snapOrderPrice(
      perps.client,
      market,
      calculateSlippagePrice(await readMarkPrice(), slippagePercent, false)
    ),
    reduceOnly: true,
  })
)
console.log(`Closed the ${marketId} position.`)
