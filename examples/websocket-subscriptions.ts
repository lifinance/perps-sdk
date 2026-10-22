import { createPerpsClient, getMarket, PerpsWsClient } from '@lifi/perps-sdk'
import { hyperliquidWsProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { lighterWsProvider } from '@lifi/perps-sdk-provider-lighter'

// Optional on the production API. Get a key at https://portal.li.fi/.
const API_KEY = 'YOUR_API_KEY'

async function run() {
  const client = createPerpsClient({ apiKey: API_KEY })

  // Each provider key maps to a factory that the client calls on the first
  // subscribe to that provider. Lighter account channels (orderUpdates,
  // positions, ...) need an auth token: register lighterProvider() on the
  // client, or pass `resolveAuthToken`. Public channels need neither.
  const ws = new PerpsWsClient(client, {
    wsProviders: {
      hyperliquid: hyperliquidWsProvider(),
      lighter: lighterWsProvider(),
    },
  })

  const btc = await getMarket(client, {
    provider: 'hyperliquid',
    marketId: 'BTC',
  })

  // --- Markets-context subscription ---
  // subscribe() returns an unsubscribe function. Multiple consumers may call
  // subscribe() for the same channel independently — the SDK ref-counts them
  // to one wire subscription and fans events out to every listener.
  const unsubContextA = await ws.subscribe(
    { channel: 'marketsContext', dex: 'hyperliquid' },
    (event) => {
      // event.data is Record<string, MarketContext>: Market.id → mid/mark/oracle
      console.log('Listener A — markets context:', event.data)
    },
    (status) => {
      // Optional: observe connection health across the lifecycle.
      // 'reconnecting' on transient drops, 'disconnected' once retries are
      // exhausted (terminal until ws.reconnect('hyperliquid') is called).
      console.log('Connection status:', status)
    }
  )

  // A second independent listener on the same channel — no second wire
  // subscription is opened; both listeners share the existing one.
  const unsubContextB = await ws.subscribe(
    { channel: 'marketsContext', dex: 'hyperliquid' },
    (event) => {
      console.log('Listener B — markets context:', event.data)
    }
  )

  // --- Orderbook subscription ---
  // marketId is the opaque Market.id from getMarkets, not a display symbol.
  const unsubOrderbook = await ws.subscribe(
    { channel: 'orderbook', dex: 'hyperliquid', marketId: btc.id },
    (event) => {
      const { bids, asks } = event.data
      console.log(
        `Orderbook BTC — best bid: ${bids[0]?.price}, best ask: ${asks[0]?.price}`
      )
    }
  )

  // Let a few events arrive.
  await new Promise((resolve) => setTimeout(resolve, 5_000))

  // Unsubscribe both listeners. The SDK keeps the wire subscription alive for
  // 250 ms after the last listener releases (WS_CHANNEL_TEARDOWN_LINGER_MS),
  // so a React StrictMode unmount→remount cycle does not thrash the wire.
  unsubContextA()
  unsubContextB()
  unsubOrderbook()

  // Drain the linger window before closing.
  await new Promise((resolve) => setTimeout(resolve, 300))

  ws.close()
}

run()
