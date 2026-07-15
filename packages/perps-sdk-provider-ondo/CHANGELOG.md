# @lifi/perps-sdk-provider-ondo

## 1.0.1

### Patch Changes

- [#244](https://github.com/lifinance/perps-sdk/pull/244) [`b9777c5`](https://github.com/lifinance/perps-sdk/commit/b9777c5326699085a3eaf9227e93b123e059e6aa) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Map the Ondo `POST /v1/api_keys` `secretKey` wire field to the stored `apiSecret` domain field at the boundary, and validate the record at write time. The mis-shaped record was previously evicted on read, so `REGISTER_API_KEY` never reported satisfied and HMAC signing used an empty secret.

- [#243](https://github.com/lifinance/perps-sdk/pull/243) [`dd0396e`](https://github.com/lifinance/perps-sdk/commit/dd0396e2b5e714314de9a24b2d477b2777d6c32f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Derive Ondo `termsAccepted` from the `GET /v1/account` terms/privacy versions instead of the SIWE token's `newAccount` flag, so a future venue terms/privacy bump re-stages `ACCEPT_PROVIDER_TERMS`. Removes the now-unused `newAccount` token field and its post-agreement rewrite.

## 1.0.0

### Minor Changes

- [#238](https://github.com/lifinance/perps-sdk/pull/238) [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Surface Ondo venue-terms acceptance and API-key creation as explicit setup steps.

  - **perps-types**: add `ActionType.ACCEPT_PROVIDER_TERMS` (provider-level venue terms, distinct from the app-level `META_ACCEPT_TERMS`), `SigningMethod.SESSION` (client-only venue REST authorized by a stored provider session token), and `SessionActionStep` — a marker step carrying no request material, so a backend-authored path or body can never be executed with the client's bearer token. `OndoAccountConfig` gains required `termsAccepted` and `apiKeyRegistered` flags. The `ActionResult` failure variant gains an optional structured `errorCode`.
  - **perps-sdk**: new optional plugin hook `onExecuteResults(address, results)`, invoked after every `executeAction` round-trip on both the execute and provider-setup paths, so plugins can react to structured failures.
  - **perps-sdk-provider-ondo**: venue-terms acceptance moves out of the SIWE login (no more implicit `POST /v1/agreement` on first login) and API-key creation out of lazy first-use minting into explicit `SESSION`-signed setup steps executed directly against the venue; the lazy mint remains as a headless fallback. `getAccount` reports `termsAccepted` (from the login token's `newAccount` flag) and `apiKeyRegistered` (local key presence). A stored API key is evicted when an execute result carries `errorCode: Unauthorized`, so the `REGISTER_API_KEY` setup step re-stages instead of every action failing.
  - **perps-sdk-provider-lighter / -hyperliquid**: exhaustive `ActionType` projections extended for the new member (rejected as unsupported).

- [#238](https://github.com/lifinance/perps-sdk/pull/238) [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Replace Ondo venue-side REST execution with API-key HMAC signing.

  - **perps-types**: remove `RestCallActionStep`, `RestCallSignedActionStep`, and `SigningMethod.AUTH_TOKEN`; add `SigningMethod.HMAC`, `HmacActionStep`, and `HmacSignedActionStep`. The step names its signing mechanism (like `Eip712ActionStep`/`WasmBlobActionStep`), not its transport. The signed step carries a structured `hmac { keyId, timestampMs, signature }` field — there is no `headers` map on the wire, so no venue header names (nor a Bearer JWT / API secret) can ride it. `request.body` is a pre-serialized string that transits verbatim (the exact bytes the HMAC covers).
  - **perps-sdk**: drop the `AUTH_TOKEN` execution detour and the `executeRestCallActions` plugin hook; `HMAC` steps sign then ride the standard `executeAction` path like EIP-712.
  - **perps-sdk-provider-ondo**: remove the venue-side REST execution model; add per-request HMAC-SHA256 signing (`hmacSignRequest`) with a client-held API key minted silently on first trading use, an `OndoApiKeyStore`, and first-login venue-terms acceptance. The JWT and API secret stay userland — only the HMAC key id, timestamp, and signature leave the client, and the backend builds the venue's transport headers at relay time.

### Patch Changes

- Updated dependencies [[`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307), [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307)]:
  - @lifi/perps-types@2.0.0
  - @lifi/perps-sdk@3.0.0

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
