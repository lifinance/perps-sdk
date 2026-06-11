<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center">LI.FI Perps SDK</h1>

[**LI.FI Perps SDK**](https://public-perps-docs.mintlify.app/) is a TypeScript SDK for trading perpetuals across multiple DEXes through one unified interface.

- **Unified API** across perpetual DEXes (Hyperliquid, Lighter).
- **Provider plugins** — each DEX ships as a separate package you register on the client.
- **Agent-based signing** — trades execute without per-order wallet popups (one-time wallet signature during setup).
- **Two layers** — low-level service functions and the high-level `PerpsClient`.
- **Realtime** — WebSocket subscriptions for prices, orderbook, and fills.
- **Fully typed** — all types exported, sourced from `@lifi/perps-types`.

## Packages

A pnpm + Lerna monorepo. Published packages live under [`packages/`](./packages):

| Package | Install for | Description |
| --- | --- | --- |
| [`@lifi/perps-sdk`](./packages/perps-sdk) | every project | Core SDK — `PerpsClient`, service functions, realtime client |
| [`@lifi/perps-sdk-provider-hyperliquid`](./packages/perps-sdk-provider-hyperliquid) | Hyperliquid | Hyperliquid provider plugin |
| [`@lifi/perps-sdk-provider-lighter`](./packages/perps-sdk-provider-lighter) | Lighter | Lighter provider plugin |
| [`@lifi/perps-types`](./packages/perps-types) | (transitive) | Shared types; re-exported from `@lifi/perps-sdk` |

## Installation

Install the core SDK plus the provider plugin(s) for the DEX(es) you target:

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
# or
npm install @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
```

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
- **Linking locally? `pnpm build` the package first.** Consumers wiring this
  SDK via a `link:` path resolve `dist/`, not `src/`. Source edits are invisible
  until you rebuild — you silently get stale `dist/`.

## Architecture

### Package layering

`@lifi/perps-types` is a zero-dependency wire-type package at the base. The core `@lifi/perps-sdk` depends on it. Each provider plugin depends on `@lifi/perps-types` directly and takes the core SDK as a peer dependency — so your project installs exactly one copy of the SDK.

```mermaid
graph TD
    S["@lifi/perps-sdk<br/>PerpsClient · services · websocket core"]
    H["@lifi/perps-sdk-provider-hyperliquid"]
    L["@lifi/perps-sdk-provider-lighter"]
    T["@lifi/perps-types<br/>wire types, zero deps"]
    S --> T
    H --> T
    L --> T
    H -. peer .-> S
    L -. peer .-> S
```

### Action lifecycle

Every mutating action (order placement, cancellation, withdrawal, setup) follows the same pipeline. The developer experience is one wallet signature at setup time — the agent provisioned during setup signs all subsequent orders automatically, with no per-order wallet popups.

```mermaid
sequenceDiagram
    participant App
    participant PC as PerpsClient
    participant P as Provider plugin
    participant BE as LI.FI backend
    App->>PC: placeOrder(params)
    PC->>BE: POST /createAction
    BE-->>PC: unsigned ActionStep[]
    PC->>P: signActions(steps)
    P-->>PC: signed steps
    PC->>BE: POST /executeAction
    BE-->>PC: ExecuteActionResponse
    PC-->>App: results
```

### Data-plane split

Market-structure reads go through the LI.FI backend, which caches them in Valkey and fans out to each venue on your behalf. Per-user reads (account state, positions, orders, fills, activity) go from the SDK directly to the venue API using the end-user's own IP — this keeps venue rate limits per-user rather than concentrating them on the backend's single egress address.

```mermaid
graph LR
    SDK[Perps SDK]
    BE["LI.FI backend<br/>Valkey-cached"]
    V[Venue API]
    SDK -- "markets · assets · prices<br/>ohlcv · orderbook" --> BE
    BE --> V
    SDK -- "account · positions · orders<br/>fills · activity" --> V
```

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

See [`examples/agent-trading.ts`](./examples/agent-trading.ts) for the full setup
flow, including signing the user-gated steps.

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

## Examples

Runnable scripts in [`examples/`](./examples):

| Script | What it shows |
| --- | --- |
| [`market-data.ts`](./examples/market-data.ts) | Fetching markets, assets, prices, orderbook, OHLCV |
| [`account-data.ts`](./examples/account-data.ts) | Account state, positions, orders, fills |
| [`agent-trading.ts`](./examples/agent-trading.ts) | Full setup flow + placing and cancelling orders |
| [`error-handling.ts`](./examples/error-handling.ts) | Handling `PerpsError` codes and retries |
| [`custom-storage.ts`](./examples/custom-storage.ts) | Plugging in a custom credential store |

## Development

pnpm workspace. From the repository root:

| Command | Does |
| --- | --- |
| `pnpm install` | Install workspace dependencies |
| `pnpm build` | Build every package (CJS + ESM + types) |
| `pnpm test` | Run all package tests (vitest) |
| `pnpm test:unit` | Unit tests only |
| `pnpm check` | Biome lint/format check |
| `pnpm check:write` | Biome auto-fix |
| `pnpm check:types` | TypeScript type checking across packages |

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Changelog](./CHANGELOG.md)
</content>
</invoke>
