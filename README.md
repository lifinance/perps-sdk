<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center">LI.FI Perps SDK</h1>

[**LI.FI Perps SDK**](https://public-perps-docs.mintlify.app/) is a TypeScript SDK for trading perpetuals across multiple DEXes through a unified interface.

- Unified interface across perpetual DEXes (Hyperliquid and more)
- Two signing modes: **USER** (wallet signs each action) and **USER_AGENT** (agent auto-signs, no popups)
- Low-level service functions and high-level `PerpsClient`
- Real-time WebSocket subscriptions for prices, orderbook, and fills
- Full TypeScript support with all types exported

## Installation

```bash
pnpm add @lifi/perps-sdk
# or
npm install @lifi/perps-sdk
```

## Quick Start

Get an API key from the [LI.FI Partner Portal](https://portal.li.fi/).

### Fetch Market Data

```typescript
import { createPerpsClient, getDexes, getMarkets, getPrices } from '@lifi/perps-sdk'

const client = createPerpsClient({ integrator: 'my-app', apiKey: 'your-api-key' })

const { dexes } = await getDexes(client)
const { markets } = await getMarkets(client, { dex: 'hyperliquid' })
const { prices } = await getPrices(client, { dex: 'hyperliquid', symbols: ['BTC', 'ETH'] })
```

### Trade with PerpsClient

```typescript
import { PerpsClient } from '@lifi/perps-sdk'

const perps = new PerpsClient({ integrator: 'my-app', apiKey: 'your-api-key' })

// Enable agent signing mode (one-time setup, requires user wallet signature)
await perps.setSigningMode(address, 'hyperliquid', 'USER_AGENT')

// Place orders without wallet popups
const result = await perps.placeOrder({
  dex: 'hyperliquid',
  address,
  symbol: 'BTC',
  side: 'BUY',
  type: 'MARKET',
  size: '0.1',
  price: '95000.00',
})
```

## Examples

See the [`examples/`](./examples) folder for runnable code covering market data, account management, trading, agent-based signing, error handling, and custom storage.

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
