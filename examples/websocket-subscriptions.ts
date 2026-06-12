import { createPerpsClient, getMarkets, PerpsWsClient } from '@lifi/perps-sdk'
import { hyperliquidWsProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { lighterWsProvider } from '@lifi/perps-sdk-provider-lighter'

async function run() {
  const client = createPerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
  })

  // Create the realtime client. Each provider key maps to a factory that is
  // invoked lazily on first subscribe. Lighter authenticated channels
  // (orderUpdates, positions) require an authProvider that returns a fresh
  // token for the given wallet address — see LighterAuthProvider in
  // @lifi/perps-sdk-provider-lighter. Public channels work without it.
  const ws = new PerpsWsClient(client, {
    wsProviders: {
      hyperliquid: hyperliquidWsProvider(),
      lighter: lighterWsProvider({
        // authProvider: (address) => myPlugin.resolveAuthToken(address),
      }),
    },
  })

  // Resolve a market to subscribe to.
  const { markets } = await getMarkets(client, { provider: 'hyperliquid' })
  const btc = markets.find((m) => m.baseAsset.displaySymbol === 'BTC')
  if (!btc) {
    throw new Error('BTC market not found')
  }

  // --- Prices subscription ---
  // subscribe() returns an unsubscribe function. Multiple consumers may call
  // subscribe() for the same channel independently — the SDK ref-counts them
  // to one wire subscription and fans events out to every listener.
  const unsubPricesA = await ws.subscribe(
    { channel: 'prices', dex: 'hyperliquid' },
    (event) => {
      // event.data is Record<string, string>: Market.id → last-trade price
      console.log('Listener A — prices:', event.data)
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
  const unsubPricesB = await ws.subscribe(
    { channel: 'prices', dex: 'hyperliquid' },
    (event) => {
      console.log('Listener B — prices:', event.data)
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
  unsubPricesA()
  unsubPricesB()
  unsubOrderbook()

  // Drain the linger window before closing.
  await new Promise((resolve) => setTimeout(resolve, 300))

  ws.close()
}

run()
