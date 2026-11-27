import { setTimeout as sleep } from 'node:timers/promises'
import { createPerpsClient, PerpsWsClient } from '@lifi/perps-sdk'
import {
  hyperliquidProvider,
  hyperliquidWsProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'

const settings = {
  address: '0x677d831aef5328190852e24f13c46cac05f984e7',
  marketId: 'BTC',
  durationSeconds: 30,
} as const

const { address, marketId } = settings

const client = createPerpsClient({
  providers: [hyperliquidProvider()],
})
const ws = new PerpsWsClient(client, {
  wsProviders: { hyperliquid: hyperliquidWsProvider() },
})

const account = { dex: 'hyperliquid', address }
try {
  await Promise.all([
    ws.subscribe({ ...account, channel: 'orderUpdates' }, ({ data }) =>
      console.log('Order updates:', data)
    ),
    ws.subscribe({ ...account, channel: 'fills' }, ({ data }) =>
      console.log('Fills:', data)
    ),
    ws.subscribe({ ...account, channel: 'positions' }, ({ data }) =>
      console.log('Positions:', data)
    ),
    ws.subscribe({ ...account, channel: 'accountSummary' }, ({ data }) =>
      console.log('Account summary:', data)
    ),
    ws.subscribe(
      { ...account, channel: 'availableToTrade', marketId },
      ({ data }) => console.log('Available to trade:', data)
    ),
  ])
  await sleep(settings.durationSeconds * 1_000)
} finally {
  ws.close()
}
