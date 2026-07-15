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
  integrator: 'my-app',
  apiKey: 'your-api-key',
  providers: [hyperliquidProvider()],
})
```

## Security: agent key storage

The agent keypair is persisted via a `StorageAdapter`, which defaults to browser `localStorage`. The agent private key is therefore readable by any same-origin script — an XSS vulnerability in the host page can exfiltrate it. To harden this, pass a more secure `StorageAdapter` (e.g. one backed by an encrypted or in-memory store) to the `HyperliquidAgentStore` constructor.

The blast radius is bounded: the agent key authorizes trading only. Fund withdrawal still requires L1 `APPROVE_AGENT` consent, which the agent key alone cannot grant.

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/) — the exported surface and the agent signing model
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
