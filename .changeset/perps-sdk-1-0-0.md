---
"@lifi/perps-sdk": major
---

First stable release of the LI.FI Perps SDK — a unified TypeScript interface for trading perpetuals across multiple DEXes. This release reshapes the SDK into a focused set of packages and finalizes the public API.

**Packages**

- `@lifi/perps-sdk` — core client (`PerpsClient`), service functions, and the realtime `PerpsWsClient`.
- `@lifi/perps-sdk-provider-hyperliquid` and `@lifi/perps-sdk-provider-lighter` — per-DEX provider plugins registered on the client.
- `@lifi/perps-types` — shared, zero-dependency types underpinning the whole stack.

**Unified market model**

- Markets, assets, and categories are modeled with an explicit collateral partition. A market is referenced by an opaque `marketId` / `MarketRef` rather than a display symbol, so the same code addresses any venue.
- Market-structure reads (markets, assets, prices, OHLCV, orderbook) resolve through the LI.FI backend; per-user reads (account, positions, orders, fills, activity) go directly to the venue.

**Provider plugin architecture**

- A single `PerpsProvider` plugin SPI: register provider plugins on the client and route every call by provider key.
- Descriptor-driven signing — each action declares its signing method (agent key, wallet EIP-712, or EVM transaction) and is dispatched automatically. One-time setup (`checkSetup` → `executeSetup`) provisions a per-user signing agent, after which orders need no wallet prompt.

**Realtime**

- `PerpsWsClient` with ref-counted subscription fan-out, automatic reconnect and replay, and schema-validated frames. Channels for prices, orderbook, candles, fills, order updates, positions, and spot balances, plus streaming quotes over the orderbook.

**Quotes, order math, and formatting**

- One-shot `getQuote` with a VWAP book-walk, position/order math helpers (liquidation distance, effective leverage, removable margin), and provider-correct price/size formatting and liquidation-price estimation.
- Exact decimal handling of order-submission values via big.js, with canonical financial display formatters.

**Resilience**

- Retry transport with per-provider rate-limit policies and automatic nonce-refresh retries on execution.

Additional client surfaces: `getMeta`, terms acceptance, governance vote counts, and token metadata.
