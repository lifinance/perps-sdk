import { setTimeout as sleep } from 'node:timers/promises'
import { createPerpsClient, PerpsWsClient } from '@lifi/perps-sdk'
import {
  hyperliquidProvider,
  hyperliquidWsProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'

const settings = {
  marketId: 'BTC',
  durationSeconds: 15,
  candleInterval: '1m',
} as const

const market = { dex: 'hyperliquid', marketId: settings.marketId }

const client = createPerpsClient({
  providers: [hyperliquidProvider()],
})
const ws = new PerpsWsClient(client, {
  wsProviders: { hyperliquid: hyperliquidWsProvider() },
})

try {
  await Promise.all([
    ws.subscribe({ ...market, channel: 'marketContext' }, ({ data }) =>
      console.log('Mark price:', data.markPrice)
    ),
    ws.subscribe({ ...market, channel: 'orderbook' }, ({ data }) =>
      console.log('Best bid and ask:', data.bids[0], data.asks[0])
    ),
    ws.subscribe({ ...market, channel: 'trades' }, ({ data }) =>
      console.log('Trades:', data)
    ),
    ws.subscribe(
      { ...market, channel: 'candle', interval: settings.candleInterval },
      ({ data }) => console.log('Candle close:', data.c)
    ),
  ])
  await sleep(settings.durationSeconds * 1_000)
} finally {
  ws.close()
}
