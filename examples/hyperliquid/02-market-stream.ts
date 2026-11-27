// Stream public Hyperliquid market data over WebSocket: the market context,
// the orderbook, trades, and candles. Requires no wallet and no account.
import { setTimeout as sleep } from 'node:timers/promises'
import { createPerpsClient, PerpsWsClient } from '@lifi/perps-sdk'
import {
  HYPERLIQUID_PROVIDER_KEY,
  hyperliquidProvider,
  hyperliquidWsProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'

const dex = HYPERLIQUID_PROVIDER_KEY
const marketId = process.env.MARKET_ID ?? 'BTC'
const streamSeconds = Number(process.env.STREAM_SECONDS ?? '15')

const client = createPerpsClient({
  apiKey: process.env.LIFI_API_KEY,
  providers: [hyperliquidProvider()],
})
const ws = new PerpsWsClient(client, {
  wsProviders: { [dex]: hyperliquidWsProvider() },
})

// Each subscribe() resolves to its unsubscribe function. Listeners on the same
// channel share one venue subscription.
const unsubscribes = await Promise.all([
  ws.subscribe(
    { channel: 'marketContext', dex, marketId },
    (event) => console.log('Mark price:', event.data.markPrice),
    (status) => console.log('Connection status:', status),
    (error) => console.error('marketContext failed:', error)
  ),
  ws.subscribe({ channel: 'orderbook', dex, marketId }, (event) => {
    const { bids, asks } = event.data
    console.log('Best bid:', bids[0]?.price, 'best ask:', asks[0]?.price)
  }),
  ws.subscribe({ channel: 'trades', dex, marketId }, (event) => {
    for (const trade of event.data) {
      console.log('Trade:', trade.side, trade.size, '@', trade.price)
    }
  }),
  ws.subscribe({ channel: 'candle', dex, marketId, interval: '1m' }, (event) =>
    console.log('Candle close:', event.data.c)
  ),
])

await sleep(streamSeconds * 1_000)

for (const unsubscribe of unsubscribes) {
  unsubscribe()
}
ws.close()
