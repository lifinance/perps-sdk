// Read the state of a Hyperliquid account: balances, the summary, positions,
// orders, fills, activity, portfolio history, and market settings. It also
// shows how to read the code of a PerpsError.
// Requires an existing account (ADDRESS). It requires no wallet.
import {
  getActivity,
  getFills,
  getMarkets,
  getPositions,
  PerpsClient,
  PerpsError,
  PerpsErrorCode,
} from '@lifi/perps-sdk'
import {
  HYPERLIQUID_PROVIDER_KEY,
  hyperliquidProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'
import { isAddress } from 'viem'

const provider = HYPERLIQUID_PROVIDER_KEY
const marketId = process.env.MARKET_ID ?? 'BTC'

const address = process.env.ADDRESS
if (address === undefined || !isAddress(address)) {
  throw new Error('Set ADDRESS to the 0x-prefixed address of the account.')
}

const perps = new PerpsClient({
  apiKey: process.env.LIFI_API_KEY,
  providers: [hyperliquidProvider()],
})

try {
  // getAccount adds the projected setup `settings` to the venue account.
  const account = await perps.getAccount({ provider, address })
  console.log('Collateral:', account.collateralBalances)
  for (const setting of account.settings) {
    console.log('Setting:', setting.type, setting.values)
  }

  const { positions } = await getPositions(perps.client, { provider, address })
  console.log('Summary:', perps.getAccountSummary(account, positions))
  for (const position of positions) {
    console.log('Position:', {
      market: position.market.id,
      side: position.side,
      size: position.size,
      entryPrice: position.entryPrice,
      unrealizedPnl: position.unrealizedPnl,
      liquidationPrice: position.liquidationPrice,
    })
  }

  // The default filter returns the active orders. Pass `statuses` for history.
  const { orders } = await perps.getOrders({ provider, address })
  console.log(`Open orders: ${orders.length}`)

  const fills = await getFills(perps.client, { provider, address, limit: 10 })
  console.log(`Fills: ${fills.items.length}, more: ${fills.pagination.hasMore}`)

  const activity = await getActivity(perps.client, {
    provider,
    address,
    limit: 10,
  })
  for (const item of activity.items) {
    console.log('Activity:', item.type, item.timestamp)
  }

  const history = await perps.getPortfolioHistory({
    provider,
    address,
    range: '7d',
  })
  console.log(
    `Portfolio points: ${history.points.length}, PnL: ${history.totalPnl}`
  )

  const { markets } = await getMarkets(perps.client, {
    provider,
    marketIds: [marketId],
  })
  const [market] = markets
  if (market === undefined) {
    throw new Error(`Market '${marketId}' not found. Set MARKET_ID.`)
  }
  const availableToTrade = await perps.getAvailableToTrade({
    provider,
    address,
    marketId,
  })
  console.log(
    `Available to trade on ${marketId}: buy ${availableToTrade.buy}, sell ${availableToTrade.sell}`
  )
  const settings = await perps.getMarketSettings({
    provider,
    address,
    market: { marketId: market.id, categoryId: market.categoryId },
  })
  console.log(`Market settings on ${marketId}:`, settings)
} catch (error) {
  if (!(error instanceof PerpsError)) {
    throw error
  }
  switch (error.code) {
    case PerpsErrorCode.AccountNotFound:
      console.error('No Hyperliquid account exists. Run 03-onboarding.ts.')
      break
    case PerpsErrorCode.RateLimitExceeded:
      console.error('Rate limit exceeded. Wait, then run the script again.')
      break
    default:
      console.error(
        `PerpsError ${error.code} from ${error.tool}:`,
        error.message
      )
  }
  process.exitCode = 1
}
