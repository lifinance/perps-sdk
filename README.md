<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center">LI.FI Perps SDK</h1>

[**LI.FI Perps SDK**](https://public-perps-docs.mintlify.app/) is a TypeScript SDK for trading perpetuals across multiple DEXes through a unified interface.

- Unified interface across perpetual DEXes (Hyperliquid, Lighter)
- Provider plugins — each DEX ships as its own package you register on the client
- Agent-based trade signing — the SDK provisions a per-user signing agent so trades execute without wallet popups (one-time wallet signature for setup)
- Low-level service functions and high-level `PerpsClient`
- Real-time WebSocket subscriptions for prices, orderbook, and fills
- Full TypeScript support with all types exported

## Packages

This repository is a pnpm + Lerna monorepo. The published packages live under [`packages/`](./packages):

| Package | Description |
| --- | --- |
| [`@lifi/perps-types`](./packages/perps-types) | Shared types for the LI.FI perps stack |
| [`@lifi/perps-sdk`](./packages/perps-sdk) | Core SDK — `PerpsClient`, service functions, realtime client |
| [`@lifi/perps-sdk-provider-hyperliquid`](./packages/perps-sdk-provider-hyperliquid) | Hyperliquid provider plugin |
| [`@lifi/perps-sdk-provider-lighter`](./packages/perps-sdk-provider-lighter) | Lighter provider plugin |

## Installation

Install the core SDK plus the provider plugin(s) for the DEX(es) you target:

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
# or
npm install @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
```

## Quick Start

Get an API key from the [LI.FI Partner Portal](https://portal.li.fi/).

### Fetch Market Data

```typescript
import { createPerpsClient, getProviders, getAssets, getPrices } from '@lifi/perps-sdk'

const client = createPerpsClient({ integrator: 'my-app', apiKey: 'your-api-key' })

const { providers } = await getProviders(client)
const { assets } = await getAssets(client, { provider: 'hyperliquid' })
const { prices } = await getPrices(client, { provider: 'hyperliquid', symbols: ['BTC', 'ETH'] })
```

### Trade with PerpsClient

Register the provider plugins you need via the `providers` option, then run the
one-time setup flow before placing orders:

```typescript
import { PerpsClient, OrderSide, OrderType } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const perps = new PerpsClient({
  integrator: 'my-app',
  apiKey: 'your-api-key',
  providers: [hyperliquidProvider()],
})

// One-time setup: provisions the signing agent and reports which steps still
// need the user's wallet signature (isReady === true once everything is satisfied).
const setup = await perps.checkSetup({ provider: 'hyperliquid', address })

// Place orders — the agent signs automatically, no wallet popups.
const result = await perps.placeOrder({
  provider: 'hyperliquid',
  address,
  asset: { assetId: 'BTC', market: 'hyperliquid' },
  side: OrderSide.BUY,
  type: OrderType.MARKET,
  size: '0.1',
  price: '95000.00',
})
```

See [`examples/agent-trading.ts`](./examples/agent-trading.ts) for the full setup
flow including user-signed setup steps.

## Examples

See the [`examples/`](./examples) folder for runnable code covering market data, account management, trading, agent-based signing, error handling, and custom storage.

## Development

This is a pnpm workspace. From the repository root:

```bash
pnpm install         # Install workspace dependencies
pnpm build           # Build every package (CJS + ESM + types)
pnpm test            # Run all package tests (vitest)
pnpm test:unit       # Unit tests only
pnpm check           # Biome lint/format check
pnpm check:write     # Biome auto-fix
pnpm check:types     # TypeScript type checking across packages
```

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
