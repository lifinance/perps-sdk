import {
  getMarket,
  OrderSide,
  OrderType,
  PerpsClient,
  type PerpsClientSigner,
  PerpsError,
  PerpsErrorCode,
  PerpsExecutionError,
  UserActionStatus,
} from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

// Optional on the production API. Get a key at https://portal.li.fi/.
const API_KEY = 'YOUR_API_KEY'
const USER_ADDRESS = '0xYOUR_WALLET_ADDRESS'
// A viem WalletClient with an account for USER_ADDRESS.
declare const walletClient: PerpsClientSigner

async function run() {
  const perps = new PerpsClient({
    apiKey: API_KEY,
    providers: [hyperliquidProvider()],
  })
  perps.setUserWallet(walletClient)

  try {
    const btc = await getMarket(perps.client, {
      provider: 'hyperliquid',
      marketId: 'BTC',
    })

    const { results } = await perps.placeOrder({
      address: USER_ADDRESS,
      provider: 'hyperliquid',
      market: { marketId: btc.id, categoryId: btc.categoryId },
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      size: '0.001',
      price: '50000',
    })

    // A venue rejection is a result, not an exception.
    for (const result of results) {
      switch (result.status) {
        case UserActionStatus.Submitted:
        case UserActionStatus.Accepted:
          console.log('Order placed:', result.orderId)
          break
        case UserActionStatus.Indeterminate:
          // The order can be live. Read the orders before a new submission.
          console.warn('Outcome unknown:', result.error)
          break
        case UserActionStatus.Failed:
          if (result.errorCode === PerpsErrorCode.InsufficientMargin) {
            console.error('Not enough margin for this order')
          } else {
            console.error(`Rejected (${result.errorCode}):`, result.error)
          }
          break
      }
    }
  } catch (error) {
    if (error instanceof PerpsExecutionError) {
      // A later stage failed after some results were known.
      console.error('Partial execution:', error.response.results, error.message)
    } else if (error instanceof PerpsError) {
      switch (error.code) {
        case PerpsErrorCode.SetupRequired:
        case PerpsErrorCode.AgentUnauthorized:
          console.error('Provider setup is incomplete. Run checkSetup.')
          break
        case PerpsErrorCode.MarketNotFound:
          console.error('Unknown market:', error.message)
          break
        case PerpsErrorCode.RateLimitExceeded:
          console.error('Rate limit exceeded. Wait before the next request.')
          break
        default:
          console.error(`Error ${error.code}: ${error.message}`)
      }
    } else {
      throw error
    }
  }
}

run()
