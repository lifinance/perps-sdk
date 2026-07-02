# @lifi/perps-sdk

## 1.5.6

### Patch Changes

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix WS resubscribe replay racing a concurrent subscribe: a channel subscribed while the reconnect replay loop is suspended is no longer sent twice. Replay now iterates a snapshot taken at replay start and re-checks the live registry before each send.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `getMarket` now throws a `MarketNotFound` `PerpsError` when the backend returns an empty markets list, instead of silently resolving `undefined` under a `Promise<Market>` type.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix `ReconnectingWebSocket.close()` never transitioning connection status to `disconnected`, which left `reconnect()` a no-op, `registerSub` sending into a dead socket, and new status listeners told `connected` after an explicit close.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix WS unsubscribe closures so double-invoking one (e.g. React StrictMode effect cleanup) no longer tears down a sibling subscription sharing the same channel.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the reference-data registry's lookup-miss refetch. A registry miss now warns once and returns `undefined`; the index is reconciled solely by `sync()` through the HTTP layer, which every REST call and each WS (re)connect already performs. The backend owns reference-data freshness (Valkey-cached, kept warm), so the client-side cache-bypassing refetch — and the cooldown and load-generation guards it required — added no freshness and are gone.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `walkOrderbook` (and `buildQuote`) now throw a `ValidationError` `PerpsError` when an orderbook level's price or size does not parse to a finite number, instead of silently propagating NaN into the quote and reporting `insufficientLiquidity: false`.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Count unrealized PnL toward available margin for `'gross'` collateral (Hyperliquid unified/portfolioMargin), matching the venue's buying-power accounting.

## 1.5.5

### Patch Changes

- [#167](https://github.com/lifinance/perps-sdk/pull/167) [`f7c77aa`](https://github.com/lifinance/perps-sdk/commit/f7c77aad84d81fbb2b9e9ac540298704f373af4b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Stop misclassifying aborted requests as retryable server errors: `fetchWithRetry` now rethrows `AbortError` immediately (no retry, no backoff sleep), backoff sleeps are signal-aware, and `request` no longer wraps a cancellation as a `ServerError`.

## 1.5.4

### Patch Changes

- [#161](https://github.com/lifinance/perps-sdk/pull/161) [`bfdfd6c`](https://github.com/lifinance/perps-sdk/commit/bfdfd6cf53b7e79ed035378ad2430a9ffdf03ab5) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Streamed quotes from `subscribeQuote` now track the live market context (mark price and funding) instead of the snapshot taken at subscribe time, so price impact no longer drifts as the market moves.

## 1.5.3

### Patch Changes

- [#165](https://github.com/lifinance/perps-sdk/pull/165) [`e2da3cf`](https://github.com/lifinance/perps-sdk/commit/e2da3cf245ebe2f8b6adab24fa269cbef2f49f4f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Make `PerpsWsClient.close()` terminal: a subscription whose provider init is suspended mid-flight when `close()` runs now aborts instead of resurrecting a live auto-reconnecting socket, and `subscribe`/`subscribeQuote` calls after `close()` reject with a typed error.

- Updated dependencies [[`0390904`](https://github.com/lifinance/perps-sdk/commit/0390904489fdacee26af87dce33cbe960e8d8f4e)]:
  - @lifi/perps-types@1.6.0

## 1.5.2

### Patch Changes

- [#158](https://github.com/lifinance/perps-sdk/pull/158) [`ac4f00d`](https://github.com/lifinance/perps-sdk/commit/ac4f00d874fcaeb6fa93ffd9645781593658f75f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix Hyperliquid account summaries double-counting locked margin and unrealized PnL: `accountValue` is total venue equity, so `availableMargin` now subtracts locked margin from it and `portfolioValue` no longer re-adds margin/PnL; `summarizeAccount` takes a `CollateralSemantics` (`'free' | 'gross' | 'equity'`) instead of the `collateralIsGross` boolean, and per-dex equity/margin now read `marginSummary` (whole account, isolated positions included) rather than the cross-only summary.

## 1.5.1

### Patch Changes

- [#156](https://github.com/lifinance/perps-sdk/pull/156) [`c4848fb`](https://github.com/lifinance/perps-sdk/commit/c4848fb38f13ae8e02ceccd29049b50af484cbae) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `getAccount` now returns the `positions` array it already computes, so consumers no longer need a second `getPositions` call (and its duplicate `clearinghouseState` fan-out) to obtain positions.

- Updated dependencies [[`c4848fb`](https://github.com/lifinance/perps-sdk/commit/c4848fb38f13ae8e02ceccd29049b50af484cbae)]:
  - @lifi/perps-types@1.5.1

## 1.5.0

### Minor Changes

- [#152](https://github.com/lifinance/perps-sdk/pull/152) [`14ee156`](https://github.com/lifinance/perps-sdk/commit/14ee156ce5529dd98148568ae6fcf3a1d86907c6) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Per-market_id streaming for Hyperliquid&Lighter

### Patch Changes

- Updated dependencies [[`14ee156`](https://github.com/lifinance/perps-sdk/commit/14ee156ce5529dd98148568ae6fcf3a1d86907c6)]:
  - @lifi/perps-types@1.5.0

## 1.4.0

### Minor Changes

- [#153](https://github.com/lifinance/perps-sdk/pull/153) [`91e3e01`](https://github.com/lifinance/perps-sdk/commit/91e3e01d1d5c1e1fdd5e883b81747b8e4e73591f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add a per-plugin `accountExists` capability and surface it on `checkSetup`, which now short-circuits with `{ accountExists: false, setup: [], isReady: false }` for unfunded accounts so consumers can gate the deposit-first flow.

## 1.3.0

### Minor Changes

- [#141](https://github.com/lifinance/perps-sdk/pull/141) [`906cce8`](https://github.com/lifinance/perps-sdk/commit/906cce8d610f90ff155fc1e830c28689e3a70411) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Added compressed pac, sac channel on hl

### Patch Changes

- Updated dependencies [[`906cce8`](https://github.com/lifinance/perps-sdk/commit/906cce8d610f90ff155fc1e830c28689e3a70411)]:
  - @lifi/perps-types@1.3.0

## 1.2.0

### Minor Changes

- [#140](https://github.com/lifinance/perps-sdk/pull/140) [`a2b6f9e`](https://github.com/lifinance/perps-sdk/commit/a2b6f9eaa88aa02c10b63c9f11ef1cd3f128fea8) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Add public trades subscription channel for Hyperliquid and Lighter; migrate Hyperliquid orderbook to the compact l2 feed.

### Patch Changes

- Updated dependencies [[`a2b6f9e`](https://github.com/lifinance/perps-sdk/commit/a2b6f9eaa88aa02c10b63c9f11ef1cd3f128fea8)]:
  - @lifi/perps-types@1.2.0

## 1.1.0

### Minor Changes

- [#135](https://github.com/lifinance/perps-sdk/pull/135) [`4e3977c`](https://github.com/lifinance/perps-sdk/commit/4e3977c33ac7f93a631899d1b270afb1499e7ea8) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Rename and extend the SDK's all-markets price surface into a market-context surface, and re-source it from the providers' all-markets context feeds so it carries oracle + mark + mid for every market.

### Patch Changes

- Updated dependencies [[`4e3977c`](https://github.com/lifinance/perps-sdk/commit/4e3977c33ac7f93a631899d1b270afb1499e7ea8)]:
  - @lifi/perps-types@1.1.0

## 1.0.1

### Patch Changes

- [#133](https://github.com/lifinance/perps-sdk/pull/133) [`32d357d`](https://github.com/lifinance/perps-sdk/commit/32d357d9965922c8179b83a309f4eab4df9aa627) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Standardize the package README

- Updated dependencies [[`32d357d`](https://github.com/lifinance/perps-sdk/commit/32d357d9965922c8179b83a309f4eab4df9aa627)]:
  - @lifi/perps-types@1.0.1

## 1.0.0

### Major Changes

- [`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - First stable release of the LI.FI Perps SDK — a unified TypeScript interface for trading perpetuals across multiple DEXes. This release reshapes the SDK into a focused set of packages and finalizes the public API.

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

### Minor Changes

- [#29](https://github.com/lifinance/perps-sdk/pull/29) [`c80a93b`](https://github.com/lifinance/perps-sdk/commit/c80a93b316dfc56072dc87617bf7a8b280cdcfd1) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Unify the account-summary surface on a single `getAccountSummary` name. The provider-interface method, the `PerpsClient` method, and both providers' standalone exports (formerly `getPortfolioSummary`, `summarizeHyperliquidAccount`, and `summarizeLighterAccount`) are now all named `getAccountSummary`. The result type `AccountSummary` is unchanged. This is a rename only — no behavioural change.

### Patch Changes

- Updated dependencies [[`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c)]:
  - @lifi/perps-types@1.0.0
