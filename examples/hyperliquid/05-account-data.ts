import {
  getActivity,
  getFills,
  getMarkets,
  getPositions,
  PerpsClient,
} from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const settings = {
  provider: 'hyperliquid',
  address: '0x677d831aef5328190852e24f13c46cac05f984e7',
  marketId: 'BTC',
  historyRange: '7d',
  limit: 10,
} as const

const { provider, address, marketId } = settings

const perps = new PerpsClient({
  providers: [hyperliquidProvider()],
})

const request = { provider, address }
const account = await perps.getAccount(request)
const { positions } = await getPositions(perps.client, request)
console.log('Account:', account)
console.log('Positions:', positions)
console.log('Summary:', perps.getAccountSummary(account, positions))
console.log('Orders:', (await perps.getOrders(request)).orders)
console.log(
  'Fills:',
  (await getFills(perps.client, { ...request, limit: settings.limit })).items
)
console.log(
  'Activity:',
  (await getActivity(perps.client, { ...request, limit: settings.limit })).items
)
console.log(
  'Portfolio:',
  await perps.getPortfolioHistory({ ...request, range: settings.historyRange })
)
console.log(
  'Available to trade:',
  await perps.getAvailableToTrade({ ...request, marketId })
)

const {
  markets: [market],
} = await getMarkets(perps.client, { provider, marketIds: [marketId] })
if (!market) {
  throw new Error(`Unknown market: ${marketId}`)
}
console.log(
  'Market settings:',
  await perps.getMarketSettings({
    ...request,
    market: { marketId, categoryId: market.categoryId },
  })
)
