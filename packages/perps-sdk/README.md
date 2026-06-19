<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

# `@lifi/perps-sdk`

Core of the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/) — a TypeScript SDK for trading perpetuals across multiple DEXes through one unified interface.

- **Unified API** across perpetual DEXes (Hyperliquid, Lighter).
- **Provider plugins** — each DEX ships as a separate package you register on the client.
- **Agent-based signing** — trades execute without per-order wallet popups (one-time wallet signature during setup).
- **Two layers** — low-level service functions and the high-level `PerpsClient`.
- **Realtime** — WebSocket subscriptions for prices, orderbook, and fills.
- **Fully typed** — all types exported, sourced from `@lifi/perps-types`.

## Installation

Install the core SDK plus the provider plugin(s) for the DEX(es) you target:

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
# or
npm install @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
```

| Package | Install for |
| --- | --- |
| `@lifi/perps-sdk` | every project |
| [`@lifi/perps-sdk-provider-hyperliquid`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid) | Hyperliquid |
| [`@lifi/perps-sdk-provider-lighter`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-lighter) | Lighter |

Get an API key from the [LI.FI Partner Portal](https://portal.li.fi/).

## Gotchas

- **Register every provider plugin on the client.** The core SDK ships no DEX
  logic — pass the plugins via the `providers` option (`hyperliquidProvider()`,
  `lighterProvider()`) or a call to any provider-specific service throws.
- **Setup needs a one-time wallet signature.** `placeOrder` signs with a
  per-user agent, not the wallet. Run `checkSetup` and complete the returned
  steps (one user-signed step provisions the agent) before trading; `isReady`
  flips `true` once everything is satisfied.
- **Markets are referenced by opaque `marketId`, not display symbol.** A
  `MarketRef` is `{ marketId, categoryId }` where `marketId` is `Market.id`
  from `getMarkets` — not a string like `'BTC'`. The same applies to the
  `marketIds` filter on `getMarkets` / `getPrices`.

## Architecture

### Package layering

`@lifi/perps-types` is a zero-dependency wire-type package at the base. The core `@lifi/perps-sdk` depends on it. Each provider plugin depends on `@lifi/perps-types` directly and takes the core SDK as a peer dependency — so your project installs exactly one copy of the SDK.

### Action lifecycle

Every mutating action (order placement, cancellation, withdrawal, setup) follows the same pipeline: `PerpsClient` requests unsigned action steps from the LI.FI backend (`createAction`), the provider plugin signs them, and the client submits the signed steps back (`executeAction`). The developer experience is one wallet signature at setup time — the agent provisioned during setup signs all subsequent orders automatically, with no per-order wallet popups.

### Data-plane split

Market-structure reads (markets, assets, prices, OHLCV, orderbook) go through the LI.FI backend, which fans out to each venue on your behalf. Per-user reads (account state, positions, orders, fills, activity) go from the SDK directly to the venue API using the end-user's own IP — this keeps venue rate limits per-user rather than concentrating them on the backend's single egress address.

## Quick Start

### Fetch market data

```typescript
import { createPerpsClient, getProviders, getMarkets, getPrices } from '@lifi/perps-sdk'

const client = createPerpsClient({ integrator: 'my-app', apiKey: 'your-api-key' })

// getProviders returns the live provider list; provider: takes a key string
// like 'hyperliquid' or 'lighter'.
const { providers } = await getProviders(client)
const { markets } = await getMarkets(client, { provider: providers[0].key })
const { prices } = await getPrices(client, {
  provider: 'hyperliquid',
  marketIds: markets.slice(0, 2).map((m) => m.id),
})
```

### Trade with PerpsClient

Register the provider plugin(s), run the one-time setup flow, then place orders:

```typescript
import { PerpsClient, OrderSide, OrderType } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const perps = new PerpsClient({
  integrator: 'my-app',
  apiKey: 'your-api-key',
  providers: [hyperliquidProvider()],
})

// One-time setup: provisions the signing agent and reports any steps still
// needing the user's wallet signature. isReady === true once satisfied.
const setup = await perps.checkSetup({ provider: 'hyperliquid', address })

// Resolve the market to trade from getMarkets, then place the order — the
// agent signs automatically, no wallet popups.
const result = await perps.placeOrder({
  provider: 'hyperliquid',
  address,
  market: { marketId: market.id, categoryId: market.categoryId },
  side: OrderSide.BUY,
  type: OrderType.MARKET,
  size: '0.1',
  price: '95000.00',
})
```

See the [`agent-trading` example](https://github.com/lifinance/perps-sdk/tree/main/examples) for the full setup flow, including signing the user-gated steps.

### Venue-correct order formatting

Tick/lot rules and margin models differ per venue, so price/size formatting and
liquidation previews are provider methods — always route them through the
market's own provider rather than applying one venue's rules to another's
markets:

```typescript
const provider = perps.client.getProvider(market.providerId)!
const price = provider.formatOrderPrice(market, 95000.25)
const size = provider.formatOrderSize(market, 0.123456)
const liq = provider.estimateLiquidationPrice(market, {
  entryPrice: 95000,
  leverage: 10,
  isLong: true,
}) // number, or undefined when the venue model can't be evaluated client-side
```

## Realtime (WebSocket)

`PerpsWsClient` is the realtime layer. It lazily opens one socket per provider
on first subscribe, ref-counts listeners onto a single wire subscription per
channel, and fans each event out to every listener — so each consumer
subscribes independently and the SDK dedupes. Active subscriptions are replayed
automatically on reconnect.

```typescript
import { PerpsWsClient, createPerpsClient } from '@lifi/perps-sdk'
import { hyperliquidWsProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { lighterWsProvider } from '@lifi/perps-sdk-provider-lighter'

const client = createPerpsClient({ integrator: 'my-app', apiKey: 'your-api-key' })

const ws = new PerpsWsClient(client, {
  wsProviders: {
    hyperliquid: hyperliquidWsProvider(),
    lighter: lighterWsProvider(),
  },
})

const unsubscribe = await ws.subscribe(
  { channel: 'marketsContext', dex: 'hyperliquid' },
  (event) => console.log(event.data), // Market.id → MarketContext (mid/mark/oracle)
  (status) => console.log(status),     // 'connected' | 'reconnecting' | 'disconnected'
)

unsubscribe() // release this listener; socket closes when the last one releases
ws.close()    // close all sockets and drop cached providers
```

Lighter's account-scoped channels (`orderUpdates`, `positions`) require an
`authProvider` on `lighterWsProvider()`. See the
[`websocket-subscriptions` example](https://github.com/lifinance/perps-sdk/tree/main/examples)
and the [SDK documentation](https://public-perps-docs.mintlify.app/) for the
full channel list, authentication, and reconnect model.

## Provider plugins

Register one plugin per DEX you trade. Each plugin's README documents its
signing model, setup flow, and exported surface:

- [`@lifi/perps-sdk-provider-hyperliquid`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid)
- [`@lifi/perps-sdk-provider-lighter`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-lighter)

## Examples

Runnable scripts live in the [`examples/`](https://github.com/lifinance/perps-sdk/tree/main/examples) directory of the repository — market data, account data, agent trading, error handling, custom storage, and WebSocket subscriptions.

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
