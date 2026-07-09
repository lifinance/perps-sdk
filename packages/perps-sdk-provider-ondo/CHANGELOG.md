# @lifi/perps-sdk-provider-ondo

## 0.1.0

### Minor Changes

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Implement the Ondo `PerpsProviderPlugin`: `ondoProvider()` wires SIWE session login (`signActions` signs the challenge, stores the venue JWT client-side, and attaches it as a `Bearer` header on REST-call steps) and direct-to-venue authenticated reads — account snapshot with gross collateral semantics, positions, orders, fills, and merged funding/liquidation activity with a composite cursor. Logged-out reads degrade to empty pages without touching the venue; a 401 evicts the stored session so `accountExists` reports false. Quotes and fee display use Ondo's public base fee schedule (2 bps maker / 5 bps taker).

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Scaffold the Ondo Perps provider package: `OndoApiClient` (venue HTTP boundary unwrapping Ondo's `GenericResponse` envelope, `Authorization: Bearer` session auth, typed `OndoApiError`/`OndoSessionExpiredError`, retrying GETs but never POSTs), `completeSiweLogin` (signs the SIWE challenge and exchanges it for an Ondo session JWT directly against the venue), and `OndoTokenStore` (persists the JWT per wallet address and environment via a `StorageAdapter`; expired tokens read back as absent).

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the Ondo realtime WS provider: `ondoWsProvider()` subscribes to Ondo's WebSocket channels — orderbook (`depthBooksPerps`), trades, klines (with SDK-interval → Ondo-resolution mapping), and market context merged from `markPricesPerps` + `fundingRatesPerps` — plus the JWT-authenticated `ordersPerps`/`fillsPerps`/`positionsPerps` streams. The stored SIWE session JWT is sent as a single `login` op per connection before the first private subscribe (re-sent after reconnects); a missing or expired session surfaces as `OndoSessionExpiredError` instead of hanging. `spotBalances` is rejected — Ondo exposes no spot balances channel.

### Patch Changes

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Snap Ondo order prices and sizes onto the venue's exact tick/lot grid. `formatOrderPrice`/`formatOrderSize` now round against the market's raw increment (via new optional `Market.priceIncrement`/`Market.sizeIncrement` fields) instead of a flat decimal budget, so orders on non-power-of-ten grids (e.g. `0.25`) are no longer rejected on submission.

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Accept the `30m` and `1M` candle intervals in the Ondo WS provider so live subscriptions for the intervals the backend advertises no longer throw and their frames route to the chart.

- Updated dependencies [[`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521), [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521)]:
  - @lifi/perps-types@1.15.0
