<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-sdk</code></h1>

Core of the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/) — a TypeScript SDK for trading perpetuals across multiple DEXes through one unified interface.

- **Unified API** across perpetual DEXes (Hyperliquid, Lighter, Ondo).
- **Provider plugins** — each DEX ships as a separate package you register on the client.
- **Agent-based signing** — trades execute without per-order wallet popups (one-time wallet signature during setup).
- **Two layers** — low-level service functions and the high-level `PerpsClient`.
- **Streaming** — WebSocket subscriptions for prices, orderbook, and fills.
- **Fully typed** — all types exported, sourced from `@lifi/perps-types`.

## Installation

Install the core SDK plus the provider plugin(s) for the DEX(es) you target:

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
```

| Package | Install for |
| --- | --- |
| `@lifi/perps-sdk` | every project |
| [`@lifi/perps-sdk-provider-hyperliquid`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid) | Hyperliquid |
| [`@lifi/perps-sdk-provider-lighter`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-lighter) | Lighter |
| [`@lifi/perps-sdk-provider-ondo`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-ondo) | Ondo |

Get an API key from the [LI.FI Partner Portal](https://portal.li.fi/).

## Quick start

Create a client, register the providers you installed, and call the service functions:

```ts
import { createPerpsClient, getMarkets } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const client = createPerpsClient({
  integrator: 'my-app',
  apiKey: 'your-api-key',
  providers: [hyperliquidProvider()],
})

const { markets } = await getMarkets(client, { provider: 'hyperliquid' })
```

## WebSocket

`PerpsWsClient` streams prices, orderbook, and account events over WebSocket. Register a WS provider per DEX; `subscribe()` returns an unsubscribe function, and multiple listeners on the same channel share one wire subscription:

```ts
import { PerpsWsClient } from '@lifi/perps-sdk'
import { hyperliquidWsProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const ws = new PerpsWsClient(client, {
  wsProviders: { hyperliquid: hyperliquidWsProvider() },
})

const unsubscribe = await ws.subscribe(
  { channel: 'orderbook', dex: 'hyperliquid', marketId: markets[0].id },
  (event) => console.log(event.data)
)
```

## Architecture

### Package layering

`@lifi/perps-types` is a zero-dependency wire-type package at the base. The core `@lifi/perps-sdk` depends on it. Each provider plugin depends on `@lifi/perps-types` directly and takes the core SDK as a peer dependency — so your project installs exactly one copy of the SDK.

### Credential storage

Every provider persists its trading credentials (agent keys, API keys, session tokens) through a pluggable `StorageAdapter`. The default `localStorageAdapter` encrypts values with AES-GCM before writing to browser `localStorage`, holding the master key as a non-extractable `CryptoKey` handle in IndexedDB — key material is never stored as plaintext. Environments without WebCrypto or IndexedDB degrade to non-persistent sessions rather than plaintext writes. Pass a custom adapter to a provider's store to use another backend.

## Examples

Runnable scripts live in the [`examples/`](https://github.com/lifinance/perps-sdk/tree/main/examples) directory of the repository — market data, account data, agent trading, error handling, custom storage, and WebSocket subscriptions.

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
