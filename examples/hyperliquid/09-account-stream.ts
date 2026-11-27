// Stream the account channels of a Hyperliquid account over WebSocket: order
// updates, fills, positions, the account summary, and the amount available to
// trade on one market.
// Requires an existing account (ADDRESS). It requires no wallet.
import { setTimeout as sleep } from 'node:timers/promises'
import { createPerpsClient, PerpsWsClient } from '@lifi/perps-sdk'
import {
  HYPERLIQUID_PROVIDER_KEY,
  hyperliquidProvider,
  hyperliquidWsProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'
import { isAddress } from 'viem'

const dex = HYPERLIQUID_PROVIDER_KEY
const marketId = process.env.MARKET_ID ?? 'BTC'
const streamSeconds = Number(process.env.STREAM_SECONDS ?? '30')

const address = process.env.ADDRESS
if (address === undefined || !isAddress(address)) {
  throw new Error('Set ADDRESS to the 0x-prefixed address of the account.')
}

const client = createPerpsClient({
  apiKey: process.env.LIFI_API_KEY,
  providers: [hyperliquidProvider()],
})
const ws = new PerpsWsClient(client, {
  wsProviders: { [dex]: hyperliquidWsProvider() },
})

// The promise rejects when the subscription fails before it registers, for
// example with AccountNotFound. onError receives the failures after that.
const onError = (error: unknown) => console.error('Stream failed:', error)

const unsubscribes = await Promise.all([
  ws.subscribe(
    { channel: 'orderUpdates', dex, address },
    (event) => {
      console.log(
        `Orders: ${event.data.orders.length} changed, ${event.data.terminated.length} closed`
      )
    },
    (status) => console.log('Connection status:', status),
    onError
  ),
  ws.subscribe(
    { channel: 'fills', dex, address },
    (event) => {
      for (const fill of event.data) {
        console.log('Fill:', fill.market.id, fill.side, fill.size, fill.price)
      }
    },
    undefined,
    onError
  ),
  ws.subscribe(
    { channel: 'positions', dex, address },
    (event) => {
      for (const position of event.data) {
        console.log(
          'Position:',
          position.market.id,
          position.side,
          position.size
        )
      }
    },
    undefined,
    onError
  ),
  ws.subscribe(
    { channel: 'accountSummary', dex, address },
    (event) => console.log('Summary:', event.data),
    undefined,
    onError
  ),
  ws.subscribe(
    { channel: 'availableToTrade', dex, address, marketId },
    (event) => {
      console.log(`Available on ${marketId}:`, event.data.buy, event.data.sell)
    },
    undefined,
    onError
  ),
])

await sleep(streamSeconds * 1_000)

for (const unsubscribe of unsubscribes) {
  unsubscribe()
}
ws.close()
