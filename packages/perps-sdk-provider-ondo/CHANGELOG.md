# @lifi/perps-sdk-provider-ondo

## 7.0.0

### Major Changes

- [#335](https://github.com/lifinance/perps-sdk/pull/335) [`0038c89`](https://github.com/lifinance/perps-sdk/commit/0038c89d4bfc956fa8e57a40f7802cbc9a8f863d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Source Ondo account collateral metadata from the backend provider category.

  Breaking: `collateralBalances[0].asset` is now the backend-owned USDC asset, changing its `id` and `displaySymbol` from `USD` to `USDC` and adding the backend `displayName` and `logoURI`. `getAccount()` now reads `/providers` and throws `PerpsError(SDKError)` when the Ondo category has no quote asset.

## 6.0.0

### Major Changes

- [#330](https://github.com/lifinance/perps-sdk/pull/330) [`e9328a6`](https://github.com/lifinance/perps-sdk/commit/e9328a6bc828ce26616ba9e718ee77ed534fed7c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `mapInterval` now takes `OhlcvInterval` instead of a bare `string` in both the Lighter and Ondo providers, so a value that is not an SDK interval is now a compile error rather than a runtime `ValidationError`. Every real caller already passed an `OhlcvInterval` (`CandleSubscription.interval`), so this only tightens the type; the runtime rejection behaviour for venue-unsupported intervals is unchanged.

### Patch Changes

- Updated dependencies [[`6b2d8f5`](https://github.com/lifinance/perps-sdk/commit/6b2d8f5eea6afab6adae20da836d2cb0d3d8e51e), [`0a4b5eb`](https://github.com/lifinance/perps-sdk/commit/0a4b5eb0ef2cc01b1f4c30a0c6f7389227ed6c2d)]:
  - @lifi/perps-types@6.0.0

## 5.1.0

### Minor Changes

- [#322](https://github.com/lifinance/perps-sdk/pull/322) [`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add TWAP action wrappers, preserve provider TWAP identifiers, sign Lighter TWAP actions, and read running TWAP parents directly from each venue.

### Patch Changes

- Updated dependencies [[`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852), [`2ffedda`](https://github.com/lifinance/perps-sdk/commit/2ffedda30f1ec78a29d3cd5e05454732912651ea)]:
  - @lifi/perps-types@5.3.0

## 5.0.0

### Major Changes

- [#302](https://github.com/lifinance/perps-sdk/pull/302) [`c75774d`](https://github.com/lifinance/perps-sdk/commit/c75774dcfaeba85e9becec2ce0e7216483d58ded) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - End the Ondo SIWE login at the client. The SIWE arm of `ondoSignActions` now persists the session JWT and returns no signed step, so the user's wallet signature over the ERC-4361 authentication message is never posted to the LI.FI backend and `SIWE_LOGIN` skips the `/executeAction` hop entirely — the same shape Lighter's client-executed `SET_REFERRAL` already had. Login behaviour is unchanged: the JWT is stored locally, `getAccount` reports `loggedIn: true`, and the `SIWE_LOGIN` setup descriptor reads satisfied.

  Breaking: `completeSiweLogin` resolves the `OndoAuthToken` directly instead of `{ token, signature }`. Callers that destructured `token` must use the returned token itself; the signature has no consumer outside the login exchange.

### Patch Changes

- Updated dependencies [[`489cca0`](https://github.com/lifinance/perps-sdk/commit/489cca07a4bc5dc5f8eded7c43075e8bed596334)]:
  - @lifi/perps-types@5.0.0

## 4.0.0

### Major Changes

- [#290](https://github.com/lifinance/perps-sdk/pull/290) [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Model transfer-margin support and requirements as provider-owned contracts.

  `PerpsMarket` now declares whether position margin is unsupported, add-only, or add-and-remove. `Position` embeds that perpetual-market capability and the venue's exact current `initialMarginRequirement`, rather than forcing risk calculations through its display-oriented numeric `leverage`.

  Every provider plugin now implements `positionMarginConstraints(position)`. Hyperliquid supplies its documented `max(initial_margin_required, 0.1 * total_position_value)` retention rule and six-decimal amount increment; Lighter supplies its position's initial-margin requirement and six-decimal increment; Ondo returns `undefined` because it is cross-margined only.

  The shared `removableIsolatedMargin({ position, constraints })` helper validates the provider inputs, computes position equity in exact decimal arithmetic, retains the stricter initial-margin or notional-floor requirement, and rounds removable margin down to the venue amount increment.

  The previous `removableMargin(position)` exports are removed from the core SDK and provider packages. Callers must resolve the position's provider-owned constraints through `PerpsClient.positionMarginConstraints(position)` and pass them to `removableIsolatedMargin`.

### Patch Changes

- Updated dependencies [[`42e1854`](https://github.com/lifinance/perps-sdk/commit/42e1854091c255ccd7fb501639b4c616a928adb1), [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca), [`4e9daa7`](https://github.com/lifinance/perps-sdk/commit/4e9daa7d3785a137a88160fc38d474011d5096d9)]:
  - @lifi/perps-types@4.0.0
  - @lifi/perps-sdk@6.0.0

## 3.0.0

### Minor Changes

- [#287](https://github.com/lifinance/perps-sdk/pull/287) [`f6dc0f6`](https://github.com/lifinance/perps-sdk/commit/f6dc0f6a8ab46a7858a0114e1328d3cebb3834a2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Declare the deposit assets each venue is funded in and discover a venue's deposit flow from the SDK.

  `ETHEREUM_USDC`, `ETHEREUM_NATIVE_GAS`, `HYPERLIQUID_USDC`, `LIGHTER_USDC`, `ROBINHOOD_USDG`, and `ROBINHOOD_NATIVE_GAS` carry the chain, checksummed address, and decimals of every token a deposit can target, so clients no longer assemble them by hand.

  `PerpsClient.getDepositFlow({ provider, address })` resolves what a deposit into that provider requires for that address, as a discriminated union: `lifiSwap` (a single route into the venue's collateral, with `toAddress` when the venue credits a provisioned address), `firstDepositPipeline` (an account-opening deposit that also seeds native gas), or `setupRequired` (the setup actions to run first). It delegates to an optional `getDepositFlow` on the provider plugin and resolves `undefined` for a provider that does not implement it. Hyperliquid reports its venue-chain USDC swap, both Lighter instances resolve against whether the account exists, and Ondo reports its provisioned deposit address or the login / deposit-address gate.

  `getGasRecommendation(client, { chainId })` reads LI.FI's gas suggestion for a chain directly from the user's client, for seeding the gas leg of a first-deposit pipeline.

  BREAKING: removes `DepositProviderKey`, `LIFI_DEPOSIT_CHAIN_BY_PROVIDER`, and `lifiDepositChainForProvider`. Resolve a provider's deposit target with `getDepositFlow` instead.

### Patch Changes

- Updated dependencies [[`f6dc0f6`](https://github.com/lifinance/perps-sdk/commit/f6dc0f6a8ab46a7858a0114e1328d3cebb3834a2)]:
  - @lifi/perps-sdk@5.0.0
  - @lifi/perps-types@3.3.2

## 2.2.0

### Minor Changes

- [#271](https://github.com/lifinance/perps-sdk/pull/271) [`822bb5f`](https://github.com/lifinance/perps-sdk/commit/822bb5ff4ddb238b8b73c77ce65ffd7e498f449d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the Ondo `CREATE_DEPOSIT_ADDRESS` session marker and client-side deposit-address provisioning flow. The shared `SessionActionStep` type now carries the fixed Ethereum USDC margin-wallet policy for this action, and the Ondo account config exposes the canonical provisioned address.

### Patch Changes

- Updated dependencies [[`822bb5f`](https://github.com/lifinance/perps-sdk/commit/822bb5ff4ddb238b8b73c77ce65ffd7e498f449d), [`ac32417`](https://github.com/lifinance/perps-sdk/commit/ac324179de2843e8dc7521863c986de304db2fb2)]:
  - @lifi/perps-types@3.3.0

## 2.1.1

### Patch Changes

- [#262](https://github.com/lifinance/perps-sdk/pull/262) [`bf8a97d`](https://github.com/lifinance/perps-sdk/commit/bf8a97dcc6937350da1f62ae8364f32ec96a3252) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix Ondo live candles appending a new bar per WebSocket tick: `OndoWsProvider.handleKline` now emits the bucket-open time (`kline.s`) as the candle time instead of the per-update timestamp (`kline.t`), so consecutive updates update the forming candle in place.

- Updated dependencies [[`128ad0c`](https://github.com/lifinance/perps-sdk/commit/128ad0cf2ea7a862ad5626eb16b2b9aa8750ecc0), [`df52f91`](https://github.com/lifinance/perps-sdk/commit/df52f9175081de8a51b94145a8a7c5337d8b21c6)]:
  - @lifi/perps-types@3.1.0

## 2.1.0

### Minor Changes

- [#260](https://github.com/lifinance/perps-sdk/pull/260) [`09cd2b6`](https://github.com/lifinance/perps-sdk/commit/09cd2b6bbe2061afc1903d3ac622722500f1fd92) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Provider packages can now declare setup actions they complete themselves via `PerpsProviderPlugin.internalSetupActions`. `PerpsClient.checkSetup` drains each such pending step in place — building, signing, and executing it with the provider's own credentials — and omits it from the returned setup list. A descriptor whose `signers` include `USER` is never treated as internal, and a failed internal step never blocks setup: it stays unsatisfied and is retried on a later `checkSetup`. The Ondo `SESSION` signing arm now executes backend-authored request-bearing steps with the stored session token.

## 2.0.0

### Patch Changes

- Updated dependencies [[`5b463da`](https://github.com/lifinance/perps-sdk/commit/5b463da30aeea57d05bc7daa84610a088c9425c0), [`e5df3a5`](https://github.com/lifinance/perps-sdk/commit/e5df3a5b712fa8c1f0ba55e7161318473de1c762)]:
  - @lifi/perps-types@3.0.0
  - @lifi/perps-sdk@4.0.0

## 1.0.2

### Patch Changes

- [#246](https://github.com/lifinance/perps-sdk/pull/246) [`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Polish package READMEs: consistent badge headers and structure, quick-start snippets, and a WebSocket section in the core README.

- [#253](https://github.com/lifinance/perps-sdk/pull/253) [`e43e046`](https://github.com/lifinance/perps-sdk/commit/e43e046b1dfaf0856a49994dcbb5857f187429c7) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix the Ondo WS provider staying bound to a previous wallet address: releasing all authenticated channels (or a socket drop) now clears the binding and cycles the connection, so a subsequent subscribe for a different address logs in cleanly.

- Updated dependencies [[`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b)]:
  - @lifi/perps-types@2.0.1

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
