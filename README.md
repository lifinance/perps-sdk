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

## Quick Start

### Fetch market data

```typescript
import { createPerpsClient, getProviders, getMarkets, getPrices } from '@lifi/perps-sdk'

const client = createPerpsClient({ integrator: 'my-app', apiKey: 'your-api-key' })

const { providers } = await getProviders(client)
const { markets } = await getMarkets(client, { provider: 'hyperliquid' })
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

## Examples

Runnable scripts in [`examples/`](./examples): market data, account management,
trading, agent-based signing, error handling, and custom storage.

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
