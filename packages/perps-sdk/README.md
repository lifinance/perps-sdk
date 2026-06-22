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

Get an API key from the [LI.FI Partner Portal](https://portal.li.fi/).

## Architecture

### Package layering

`@lifi/perps-types` is a zero-dependency wire-type package at the base. The core `@lifi/perps-sdk` depends on it. Each provider plugin depends on `@lifi/perps-types` directly and takes the core SDK as a peer dependency — so your project installs exactly one copy of the SDK.

## Examples

Runnable scripts live in the [`examples/`](https://github.com/lifinance/perps-sdk/tree/main/examples) directory of the repository — market data, account data, agent trading, error handling, custom storage, and WebSocket subscriptions.

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
