<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center">LI.FI Perps SDK</h1>

[**LI.FI Perps SDK**](https://public-perps-docs.mintlify.app/) provides a TypeScript SDK for the LI.FI Perps API. Trade perpetuals across multiple DEXes with a unified interface.

- Unified interface across multiple perpetual DEXes
- Low-level service functions for explicit signing control
- High-level `PerpsClient` with automatic agent signing (no wallet popups)
- Full TypeScript support with all types and enums exported

## Installation

```bash
pnpm add @lifi/perps-sdk
# or
npm install @lifi/perps-sdk
```

## Quick Start

```typescript
import { createPerpsClient, getDexes, getMarkets } from '@lifi/perps-sdk'

// 1. Create a client (required before any API calls)
const client = createPerpsClient({
  integrator: 'my-app',
  apiKey: 'optional-api-key',
})

// 2. Fetch market data (no authentication required)
const { dexes } = await getDexes(client)
const { markets } = await getMarkets(client, { dex: 'hyperliquid' })
```

## Examples

See the [`examples/`](./examples) folder for runnable code covering market data, account data, trading, agent-based trading, error handling, and custom storage.

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
