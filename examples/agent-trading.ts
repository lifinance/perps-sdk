import {
  calculateSlippagePrice,
  type ExecuteActionResponse,
  getMarket,
  getMarketsContext,
  isSubmittedOrAccepted,
  multiplyDecimalString,
  OrderSide,
  OrderType,
  PerpsClient,
  type PerpsClientSigner,
  type ProviderSetup,
  type SetupChecklistItem,
  snapOrderPrice,
} from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

// Optional on the production API. Get a key at https://portal.li.fi/.
const API_KEY = 'YOUR_API_KEY'
const USER_ADDRESS = '0xYOUR_WALLET_ADDRESS'
// A viem WalletClient with an account for USER_ADDRESS, e.g. wagmi's
// useWalletClient() or createWalletClient({ account: privateKeyToAccount(...) }).
declare const walletClient: PerpsClientSigner

async function run() {
  // A browser wallet that cannot sign for another chain also needs the
  // `switchChain` option.
  const perps = new PerpsClient({
    apiKey: API_KEY,
    providers: [hyperliquidProvider()],
  })
  perps.setUserWallet(walletClient)

  // 1. Complete the provider setup. checkSetup drains the SDK-signed steps
  //    itself; the steps on the checklist need the user.
  let setup = await perps.checkSetup({
    provider: 'hyperliquid',
    address: USER_ADDRESS,
  })
  if (!setup.accountExists) {
    throw new Error('No Hyperliquid account. Deposit funds first.')
  }

  while (!setup.isReady) {
    const next = setup.checklist.find((item) => !item.satisfied)
    if (!next) {
      throw new Error('Setup is not ready but no checklist step is open.')
    }

    const { results } = await runChecklistStep(perps, setup, next)
    const failed = results.find((r) => !isSubmittedOrAccepted(r))
    if (failed) {
      throw new Error(`Setup step ${next.descriptor.type}: ${failed.status}`)
    }

    setup = await perps.checkSetup({
      provider: 'hyperliquid',
      address: USER_ADDRESS,
    })
    const stillOpen = setup.checklist.find(
      (item) => item.descriptor.type === next.descriptor.type
    )
    if (stillOpen && !stillOpen.satisfied) {
      throw new Error(`Setup step ${next.descriptor.type} is not reflected yet`)
    }
  }

  // 2. Resolve the market and its current mid price.
  const btc = await getMarket(perps.client, {
    provider: 'hyperliquid',
    marketId: 'BTC',
  })
  const { prices } = await getMarketsContext(perps.client, {
    provider: 'hyperliquid',
    marketIds: [btc.id],
  })
  const mid = prices[0]?.midPrice
  if (!mid) {
    throw new Error('No BTC price')
  }

  // 3. Place a market order. The agent key signs it, so the wallet does not
  //    prompt. On a market order, `price` is the worst accepted fill price.
  const market = await perps.placeOrder({
    address: USER_ADDRESS,
    provider: 'hyperliquid',
    market: { marketId: btc.id, categoryId: btc.categoryId },
    side: OrderSide.BUY,
    type: OrderType.MARKET,
    size: '0.001',
    price: snapOrderPrice(
      perps.client,
      btc,
      calculateSlippagePrice(mid, '1', true)
    ),
    leverage: 10,
  })
  console.log('Market order:', market.results)

  // 4. Place a limit order below the market, then cancel it.
  const limit = await perps.placeOrder({
    address: USER_ADDRESS,
    provider: 'hyperliquid',
    market: { marketId: btc.id, categoryId: btc.categoryId },
    side: OrderSide.BUY,
    type: OrderType.LIMIT,
    size: '0.001',
    price: snapOrderPrice(perps.client, btc, multiplyDecimalString(mid, '0.9')),
  })
  const orderId = limit.results[0]?.orderId
  if (!orderId) {
    throw new Error(`Limit order not placed: ${limit.results[0]?.status}`)
  }

  const cancel = await perps.cancelOrders({
    address: USER_ADDRESS,
    provider: 'hyperliquid',
    ids: [orderId],
  })
  console.log('Cancel:', cancel.results)
}

async function runChecklistStep(
  perps: PerpsClient,
  setup: ProviderSetup,
  item: SetupChecklistItem
): Promise<ExecuteActionResponse> {
  const { options, type } = item.descriptor
  if (options !== null) {
    // A choice step needs a user decision. This example takes the default.
    const option = options.find((o) => o.default) ?? options[0]
    if (!option) {
      throw new Error(`Setup choice ${type} has no options`)
    }
    return perps.executeProviderOption({
      provider: 'hyperliquid',
      address: USER_ADDRESS,
      option,
    })
  }

  const step = setup.setup.find((s) => s.action === type)
  if (!step) {
    throw new Error(`Setup step ${type} is not staged`)
  }
  // The step and the checklist must come from the same checkSetup call.
  return perps.executeProviderSetupAction({
    provider: 'hyperliquid',
    address: USER_ADDRESS,
    step,
    checklist: setup.checklist,
  })
}

run()
