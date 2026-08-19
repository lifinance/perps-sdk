<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk-provider-hyperliquid/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk-provider-hyperliquid.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-sdk-provider-hyperliquid</code></h1>

Hyperliquid provider plugin for the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/). Register it on a `PerpsClient` to trade Hyperliquid perpetuals through the SDK's unified interface.

## Installation

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
```

## Quick start

```ts
import { createPerpsClient } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const client = createPerpsClient({
  apiKey: 'your-api-key',
  providers: [hyperliquidProvider()],
})
```

## Agent key storage

Setup registers an agent keypair whose private key signs orders locally, so trading needs no per-order wallet popups. The agent key authorizes trading only — it cannot withdraw funds.

The keypair is persisted through a `StorageAdapter`. The default adapter encrypts values with AES-GCM before writing to browser `localStorage`, holding the master key as a non-extractable `CryptoKey` handle in IndexedDB, so key material is never stored as plaintext. Pass your own `StorageAdapter` to the `HyperliquidAgentStore` constructor to use a different backend — a custom adapter bypasses this encryption and is responsible for protecting the key at rest.

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/) — the exported surface and the agent signing model
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
